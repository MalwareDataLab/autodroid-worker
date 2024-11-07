import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import Docker from "dockerode";
import { rimraf } from "rimraf";
import archiver from "archiver";
import axios from "axios";
import semver from "semver";
import { glob } from "glob";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { sleep } from "@shared/utils/sleep.util";
import { getErrorMessage } from "@shared/utils/getErrorMessage.util";
import {
  getStorageBaseFolder,
  getStorageBasePath,
} from "@shared/utils/getStorageBasePath.util";
import { promisifyWriteStream } from "@shared/utils/promisifyWriteStream.util";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";

// Type import
import { AppContext } from "@shared/types/appContext.type";
import { getSystemDynamicInfo } from "@shared/utils/getSystemDynamicInfo.util";
import { getSystemEnvironment } from "@shared/utils/getSystemEnvironment.util";
import {
  IProcessing,
  IProcessingFileData,
  OutputFileKind,
  PROCESSING_STATUS,
} from "../types/processing.types";

class ProcessingService {
  private readonly docker: Docker;
  private readonly context: AppContext;

  private readonly volumeName = "autodroid_worker_data";

  private currentProcess: Promise<void> = Promise.resolve();
  private processTimeout: NodeJS.Timeout | null = null;
  private processDelay = 5000;

  constructor(params: { context: AppContext }) {
    this.context = params.context;
    this.docker = new Docker(
      fsSync.existsSync("/var/run/docker.sock")
        ? { socketPath: "/var/run/docker.sock" }
        : {
            host: process.env.DOCKER_HOST,
            port: Number(process.env.DOCKER_PORT),
          },
    );
  }

  private async getProcessingPath(processingId: string) {
    const environment = getSystemEnvironment();

    if (environment === "container") {
      const volumes = await this.docker.listVolumes();
      const volumeData =
        volumes.Volumes.find(vol => vol.Name === this.volumeName) || null;

      if (!volumeData)
        throw new WorkerError({
          key: "@processing_service_get_processing_path/MISSING_VOLUME",
          message: "Missing volume for processing.",
        });
    }

    const folderName = "processing";

    return {
      system_path: path.join(getStorageBasePath(folderName), processingId),
      base_path: path.join(getStorageBaseFolder(folderName), processingId),
    };
  }

  public async init(): Promise<void> {
    await sleep(1000);
    await this.docker.ping();
    this.startProcessingInterval();

    const dockerVersion = await this.docker.version();

    if (semver.lt(dockerVersion.Version, "26.0.0")) {
      throw new WorkerError({
        key: "@processing_service_init/UNSUPPORTED_DOCKER_VERSION",
        message: `Docker version ${dockerVersion.Version} is not supported. Please upgrade to version 26.0.0 or higher.`,
      });
    }

    this.context.webSocketClient.socket.on("worker:work", data => {
      this.dispatchProcessing(data.processing_id);
    });

    this.context.webSocketClient.socket.on("worker:get-status", async () => {
      const processingIds = await this.getCurrentProcessingIds();
      await this.reportStatus(processingIds);
    });
  }

  private async imageExists(image: string): Promise<boolean> {
    const existingImageList = await this.docker.listImages();
    return existingImageList.some(existingImage =>
      existingImage.RepoTags?.includes(image),
    );
  }

  private async pullImage(image: string): Promise<void> {
    const exists = await this.imageExists(image);

    return new Promise((resolve, reject) => {
      if (exists) resolve();

      this.docker.pull(image, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        console.log(`🔃 Pulling image ${image}...`);

        this.docker.modem.followProgress(
          stream,
          (progressError: Error | null, _: any) => {
            if (progressError) {
              reject(err);
              return;
            }

            console.log(`💥 Image ${image} pulled successfully`);
            resolve();
          },
        );
      });
    });
  }

  private async getContainerInfo(
    containerId: string,
  ): Promise<Docker.Container | null> {
    try {
      const containerList = await this.docker.listContainers({
        all: true,
      });

      const exists = containerList.find(
        container => container.Id === containerId,
      );

      if (exists) {
        const container = this.docker.getContainer(containerId);
        return container;
      }
    } catch {
      throw new WorkerError({
        key: "@processing_service/FAIL_TO_GET_CONTAINER",
        message: `Unable to get container ${containerId}.`,
      });
    }

    return null;
  }

  public async dispatchProcessing(processingId: string): Promise<void> {
    console.log(`🚀 Worker is about to process ${processingId}.`);

    if (this.processTimeout) clearTimeout(this.processTimeout);
    await this.currentProcess;
    if (this.processTimeout) clearTimeout(this.processTimeout);
    await sleep(this.processDelay);
    this.currentProcess = this.startProcessing(processingId);
  }

  private async fetchDatasetFile(processing: IProcessing): Promise<string> {
    const dirExists = fsSync.existsSync(processing.system_input_dir);
    if (!dirExists)
      throw new WorkerError({
        key: "@processing_service_fetch_dataset_file/MISSING_DIRECTORY",
        message: `Directory ${processing.system_input_dir} does not exist.`,
      });

    const datasetPath = path.join(
      processing.system_input_dir,
      processing.data.dataset.file.filename,
    );
    const datasetStream = fsSync.createWriteStream(datasetPath);
    const datasetResponse = await axios.get(
      processing.data.dataset.file.public_url!,
      { responseType: "stream" },
    );
    datasetResponse.data.pipe(datasetStream);
    await promisifyWriteStream(datasetStream);

    const fileExists = fsSync.existsSync(datasetPath);
    if (!fileExists)
      throw new WorkerError({
        key: "@processing_service_fetch_dataset_file/MISSING_FILE",
        message: `Fail to download dataset for processing id ${processing.data.id}. The public URL is ${processing.data.dataset.file.public_url}.`,
      });

    return datasetPath;
  }

  private async startProcessing(processingId: string): Promise<void> {
    try {
      const processing = await this.getProcessing(processingId);

      const { processor } = processing.data;
      await this.pullImage(processor.image_tag);

      await this.fetchDatasetFile(processing);

      const params = [
        {
          key: processor.configuration.dataset_input_argument,
          value: `${processor.configuration.dataset_input_value}/${processing.data.dataset.file.filename}`,
        },
        {
          key: processor.configuration.dataset_output_argument,
          value: processor.configuration.dataset_output_value,
        },
        ...processing.data.configuration,
      ];

      const environment = getSystemEnvironment();

      const container = await this.docker.createContainer({
        Image: processor.image_tag,
        Tty: true,
        HostConfig: {
          // this doesn't work because should be nested volume directory
          ...(environment === "container"
            ? {
                Mounts: [
                  {
                    Type: "volume",
                    Source: this.volumeName,
                    Target: processor.configuration.dataset_input_value,
                    VolumeOptions: {
                      // https://stackoverflow.com/questions/38164939/can-we-mount-sub-directories-of-a-named-volume-in-docker
                      // https://docs.docker.com/engine/storage/volumes/#choose-the--v-or---mount-flag
                      // https://github.com/apocas/dockerode/issues/780
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore
                      Subpath: processing.volume_input_dir,
                    },
                  },
                  {
                    Type: "volume",
                    Source: this.volumeName,
                    Target: processor.configuration.dataset_output_value,
                    VolumeOptions: {
                      Subpath: processing.volume_output_dir,
                    },
                  },
                ],
              }
            : {
                Binds: [
                  `${processing.system_input_dir}:${processor.configuration.dataset_input_value}:rw`,
                  `${processing.system_output_dir}:${processor.configuration.dataset_output_value}:rw`,
                ],
              }),
        },
        Cmd: [
          processor.configuration.command,
          ...params.flatMap(
            ({ key, value }: { key: string; value: string }) => [
              `--${key}`,
              value,
            ],
          ),
        ],
      } as Docker.ContainerCreateOptions);

      try {
        await container.start();

        await processing.configuration.setConfigValue(
          "container_id",
          container.id,
        );
      } catch (error) {
        await container.remove({ force: true });
        throw error;
      }
    } catch (error) {
      await this.handleFailure({
        processingId,
        containerId: null,
        reason: (error as any).message,
      });
    } finally {
      this.startProcessingInterval();
    }
  }

  private async getProcessing(processingId: string): Promise<IProcessing> {
    const configuration = new ConfigurationManagerService(
      `processing/${processingId}/${processingId}`,
    ) as IProcessing["configuration"];

    const processing = await this.context.api.client.get(
      `/worker/processing/${processingId}`,
    );

    const data = processing.data as IProcessing["data"];
    if (
      !data?.id ||
      !data.processor?.image_tag ||
      !Array.isArray(data.configuration) ||
      !data.dataset?.file?.public_url
    )
      throw new WorkerError({
        key: "@processing_service_get_processing/MISSING_PROCESSING_DATA",
        message: "Missing processing data.",
        debug: { data },
      });

    const { system_path, base_path } =
      await this.getProcessingPath(processingId);

    const input_path = path.join("shared", "inputs");
    const output_path = path.join("shared", "outputs");

    const system_input_dir = path.join(system_path, input_path);
    const system_output_dir = path.join(system_path, output_path);

    const volume_input_dir = path.join(base_path, input_path);
    const volume_output_dir = path.join(base_path, output_path);

    if (!fsSync.existsSync(system_input_dir))
      await fsPromises.mkdir(system_input_dir, { recursive: true });

    if (!fsSync.existsSync(system_input_dir))
      throw new WorkerError({
        key: "@processing_service_get_processing/MISSING_INPUT_DIRECTORY",
        message: `Fail to create input directory for processing id ${processingId}.`,
      });

    if (!fsSync.existsSync(system_output_dir))
      await fsPromises.mkdir(system_output_dir, { recursive: true });

    if (!fsSync.existsSync(system_output_dir))
      throw new WorkerError({
        key: "@processing_service_get_processing/MISSING_OUTPUT_DIRECTORY",
        message: `Fail to create output directory for processing id ${processingId}.`,
      });

    const configData = configuration.getConfig();

    const payload = {
      data,
      container_id: configData.container_id || null,

      system_working_dir: system_path,
      system_input_dir,
      system_output_dir,

      volume_working_dir: base_path,
      volume_input_dir,
      volume_output_dir,

      internal_status: configData.internal_status || PROCESSING_STATUS.PENDING,
    };

    await configuration.setConfig(payload);

    return {
      ...payload,
      configuration,
    };
  }

  private async cleanup({
    processingId,
    containerId,
  }: {
    processingId: string;
    containerId?: string | null;
  }) {
    try {
      if (containerId) {
        const container = this.docker.getContainer(containerId);
        await container.remove({ force: true });
      }

      if (processingId) {
        const { system_path } = await this.getProcessingPath(processingId);
        if (fsSync.existsSync(system_path)) {
          await rimraf(system_path);
        }
      }
    } catch (error) {
      console.log(
        `❌ Fail to cleanup processing id ${processingId}. ${getErrorMessage(error)}`,
      );
    }
  }

  private async getLatestLogsFromContainer({
    container,
    tail,
  }: {
    container: Docker.Container;
    tail: number;
  }): Promise<string> {
    if (!container) return "";

    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
      });
      const logOutput = logs.toString("utf-8");
      return logOutput;
    } catch (error) {
      console.log(
        `❌ Fail to get logs from container ${container.id}. ${getErrorMessage(error)}`,
      );

      return "";
    }
  }

  private async processExecution(processingId: string) {
    const processing = await this.getProcessing(processingId);
    const configData = processing.configuration.getConfig();

    try {
      if (!configData.container_id)
        throw new WorkerError({
          key: "@processing_service_process_execution/NO_CONTAINER_ID_FOR_PROCESSING",
          message: `Unable to find container ID for ${processing.data.id}.`,
        });

      const container = await this.getContainerInfo(configData.container_id);

      if (!container)
        throw new WorkerError({
          key: "@processing_service_process_execution/MISSING_CONTAINER",
          message: `Unable to find container ${configData.container_id}.`,
        });

      const containerInfo = await container.inspect();

      if (containerInfo.State.Running) {
        await this.context.api.client.post(
          `/worker/processing/${processingId}/progress`,
        );
      } else {
        const succeeded = containerInfo.State.ExitCode === 0;

        const files = await fsPromises.readdir(processing.system_output_dir);
        if (files.length === 0) {
          throw new WorkerError({
            key: "@processing_service_process_execution/NO_OUTPUT_FILES",
            message: `Process completed but no files found on output directory of processing id ${processingId}.`,
          });
        } else {
          await this.zipAndUpload(processing);
        }

        if (succeeded) {
          await this.handleSuccess({
            processingId,
            containerId: configData.container_id,
          });
        } else {
          await this.handleFailure({
            processingId,
            containerId: configData.container_id,
            reason: `Container exited with code ${containerInfo.State.ExitCode}.`,
          });
        }
      }
    } catch (error) {
      await this.handleFailure({
        containerId: configData.container_id,
        processingId,
        reason: (error as any).message,
      });
    }
  }

  private async zipDirectory({
    containerDir,
    globPatterns,
    zipDestinationFilePath,
  }: {
    containerDir: string;
    globPatterns: string[];
    zipDestinationFilePath: string;
  }): Promise<IProcessingFileData> {
    const files = await glob(
      globPatterns.map(pattern => path.join(containerDir, pattern)),
    );
    return new Promise<IProcessingFileData>((resolve, reject) => {
      const output = fsSync.createWriteStream(zipDestinationFilePath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      const hash = crypto.createHash("md5");

      output.on("data", chunk => {
        hash.update(chunk);
      });

      output.on("close", () => {
        const md5_hash = hash.digest("hex");
        resolve({
          size: archive.pointer(),
          md5_hash,
          filename: path.basename(zipDestinationFilePath),
          mime_type: "application/zip",
        });
      });

      archive.on("error", reject);

      archive.pipe(output);

      files.forEach(filePath => {
        archive.file(filePath, { name: path.relative(containerDir, filePath) });
      });

      archive.finalize();
    });
  }

  private async getUploadUrl({
    processing,
    kind,
    fileData,
  }: {
    processing: IProcessing;
    kind: OutputFileKind;
    fileData: IProcessingFileData;
  }): Promise<string> {
    if (processing.data.result_file?.upload_url)
      return processing.data.result_file.upload_url;

    try {
      const { data } = await this.context.api.client.post(
        `/worker/processing/${processing.data.id}/${kind}/generate_upload`,
        fileData,
      );

      if (!data[kind].upload_url)
        throw new WorkerError({
          key: "@processing_service_get_upload_url/MISSING_UPLOAD_URL",
          message: `Missing ${kind} upload url for processing id ${processing.data.id}.`,
        });

      return data[kind].upload_url;
    } catch (error) {
      throw new WorkerError({
        key: "@processing_service_get_upload_url/FAIL_TO_GET_UPLOAD_URL",
        message: `Fail to get ${kind} upload url for processing id ${processing.data.id}. ${getErrorMessage(error)}`,
      });
    }
  }

  private async zipAndUpload(processing: IProcessing) {
    try {
      const { processor } = processing.data;

      const resultFilePath = path.join(
        processing.system_working_dir,
        `${processing.data.id}_result_file.zip`,
      );

      const resultFile = await this.zipDirectory({
        containerDir: processing.system_output_dir,
        globPatterns: processor.configuration.output_result_file_glob_patterns,
        zipDestinationFilePath: resultFilePath,
      });

      console.log(
        `📦 Zip result file created for processing id ${processing.data.id}.`,
      );

      const metricsFilePath = path.join(
        processing.system_working_dir,
        `${processing.data.id}_metrics_file.zip`,
      );

      const metricsFile = await this.zipDirectory({
        containerDir: processing.system_output_dir,
        globPatterns: processor.configuration.output_metrics_file_glob_patterns,
        zipDestinationFilePath: metricsFilePath,
      });

      console.log(
        `📦 Zip metrics file created for processing id ${processing.data.id}.`,
      );

      const resultFileUploadUrl = await this.getUploadUrl({
        processing,
        kind: "result_file",
        fileData: resultFile,
      });

      console.log(
        `📦 Uploading result zip file for processing id ${processing.data.id}...`,
      );

      const resultStream = fsSync.createReadStream(resultFilePath);
      await axios.put(resultFileUploadUrl, resultStream, {
        headers: {
          "Content-Type": "application/zip",
        },
      });

      await this.context.api.client.post(
        `/worker/processing/${processing.data.id}/result_file/uploaded`,
      );

      console.log(
        `📤 Uploaded result zip file for processing id ${processing.data.id}!`,
      );

      const metricsFileUploadUrl = await this.getUploadUrl({
        processing,
        kind: "metrics_file",
        fileData: metricsFile,
      });

      console.log(
        `📦 Uploading metrics zip file for processing id ${processing.data.id}...`,
      );

      const metricsStream = fsSync.createReadStream(metricsFilePath);
      await axios.put(metricsFileUploadUrl, metricsStream, {
        headers: {
          "Content-Type": "application/zip",
        },
      });

      await this.context.api.client.post(
        `/worker/processing/${processing.data.id}/metrics_file/uploaded`,
      );

      console.log(
        `📤 Uploaded metrics zip file for processing id ${processing.data.id}!`,
      );

      console.log(
        `✅ Zip file uploaded successfully for processing id ${processing.data.id}.`,
      );
    } catch (error) {
      throw new WorkerError({
        key: "@processing_service_zip_and_upload/FAIL_TO_UPLOAD",
        message: `Fail to upload zip file for processing id ${processing.data.id}. ${getErrorMessage(error)}`,
      });
    }
  }

  private async handleSuccess({
    processingId,
    containerId,
  }: {
    processingId: string;
    containerId: string;
  }) {
    if (!processingId) return;

    try {
      await this.context.api.client.post(
        `/worker/processing/${processingId}/success`,
      );

      await this.cleanup({
        processingId,
        containerId,
      });

      console.log(`✅ Processing id ${processingId} succeeded.`);
    } catch (error) {
      console.log(
        `❌ Fail to handle success of processing id ${processingId}. ${getErrorMessage(error)}`,
      );
    }
  }

  private async handleFailure({
    processingId,
    containerId,
    reason,
  }: {
    processingId: string;
    containerId: string | null;
    reason: string | null;
  }) {
    if (!processingId) return;

    try {
      const container = await this.getContainerInfo(containerId!);
      if (container) {
        const logs = await this.getLatestLogsFromContainer({
          container,
          tail: 10,
        });

        console.log(`📄 Latest logs from container ${containerId}:\n${logs}`);
      } else {
        console.log(`❌ Unable to get logs from container ${containerId}.`);
      }

      await this.cleanup({
        processingId,
        containerId,
      });

      await this.context.api.client.post(
        `/worker/processing/${processingId}/failure`,
        { reason: reason ? String(reason) : null },
      );

      console.log(`❌ Processing id ${processingId} failed. ${reason}`);
    } catch (error) {
      console.log(
        `❌ Fail to handle failure of processing id ${processingId}. ${getErrorMessage(error)}`,
      );
    }
  }

  private startProcessingInterval() {
    if (this.processTimeout) clearTimeout(this.processTimeout);
    this.currentProcess.then(() => {
      this.processTimeout = setTimeout(() => {
        this.currentProcess = this.process();
      }, this.processDelay);
    });
  }

  private async getCurrentProcessingIds(): Promise<string[]> {
    const processingPath = getStorageBasePath("processing");

    const processingIds = (
      await fsPromises.readdir(processingPath).catch(() => [])
    ).filter(file => {
      return fsSync.lstatSync(path.join(processingPath, file)).isDirectory();
    });

    return processingIds;
  }

  private async reportStatus(processingIds: string[]) {
    const telemetry = await getSystemDynamicInfo();

    const { version } = getEnvConfig().APP_INFO;

    if (processingIds.length > 0) {
      this.context.webSocketClient.socket.emit("worker:status", {
        status: "WORK",
        version,
        processing_ids: processingIds,
        telemetry,
      });
    } else {
      this.context.webSocketClient.socket.emit("worker:status", {
        status: "IDLE",
        version,
        processing_ids: processingIds,
        telemetry,
      });
    }
  }

  private async process(): Promise<void> {
    if (this.context.webSocketClient.getIsConnected()) {
      const processingIds = await this.getCurrentProcessingIds();

      if (processingIds.length > 0) {
        console.log(`🔄 Processing ${processingIds.length} items...`);
      } else {
        console.log("🆗 Idle. Waiting for items.");
      }

      await this.reportStatus(processingIds);

      await processingIds.reduce<Promise<any>>((promise, processingId) => {
        return promise.then(async () => {
          return this.processExecution(processingId);
        });
      }, Promise.resolve());
    }

    this.startProcessingInterval();
  }
}

export { ProcessingService };
