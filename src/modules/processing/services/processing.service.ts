import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
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
import { retryExecution } from "@shared/utils/retryExecution.util";
import { logger } from "@shared/utils/logger";
import { sleep } from "@shared/utils/sleep.util";
import { getErrorMessage } from "@shared/utils/getErrorMessage.util";
import {
  getStorageBasePath,
  getStorageBaseFolder,
} from "@shared/utils/getStorageBasePath.util";
import { promisifyWriteStream } from "@shared/utils/promisifyWriteStream.util";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";

// Type import
import { AppContext } from "@shared/types/appContext.type";
import { WORKER_STATUS } from "@shared/infrastructure/websocket/socket.types";
import { getSystemDynamicInfo } from "@shared/utils/getSystemDynamicInfo.util";
import { getSystemEnvironment } from "@shared/utils/getSystemEnvironment.util";
import {
  IProcessing,
  OutputFileKind,
  IProcessingFileData,
  PROCESSING_STATUS,
} from "../types/processing.types";

const retry = retryExecution();

class ProcessingService {
  private readonly docker: Docker;
  private readonly context: AppContext;

  private readonly volumeName = "autodroid_worker_data";

  private currentProcess: Promise<void> = Promise.resolve();
  private processTimeout: NodeJS.Timeout | null = null;
  private processDelay = 5000;

  private status: WORKER_STATUS | null = null;
  private processCount: number | null = null;

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

  private generateContainerName(processingId: string) {
    return `autodroid_worker_${processingId}`;
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
      if (exists) {
        resolve();
        return;
      }

      this.docker.pull(image, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        logger.info(`🔃 Pulling image ${image}...`);

        this.docker.modem.followProgress(
          stream,
          (progressError: Error | null, _: any) => {
            if (progressError) {
              reject(err);
              return;
            }

            logger.info(`💥 Image ${image} pulled successfully`);
            resolve();
          },
        );
      });
    });
  }

  private async getProcessingContainer({
    processingId,
  }: {
    processingId: string;
  }): Promise<Docker.Container | null> {
    const containerName = this.generateContainerName(processingId);
    try {
      const containers = await this.docker.listContainers({
        limit: 1,
        filters: `{"name": ["${containerName}"]}`,
      });

      if (containers.length === 0) return null;
      const container = this.docker.getContainer(containers[0].Id);
      return container;
    } catch {
      throw new WorkerError({
        key: "@processing_service/FAIL_TO_GET_CONTAINER",
        message: `Unable to get container ${containerName}.`,
      });
    }
  }

  public async dispatchProcessing(processingId: string): Promise<void> {
    logger.info(`🚀 Worker is about to process ${processingId}.`);

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
      await retry(() => this.pullImage(processor.image_tag));

      await retry(() => this.fetchDatasetFile(processing));

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
        name: this.generateContainerName(processingId),
        Image: processor.image_tag,
        Tty: true,
        HostConfig: {
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

        await sleep(5000);
      } catch (error) {
        await container.remove({ force: true });
        throw error;
      }
    } catch (error) {
      await this.handleFailure({
        processingId,
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

    const processing = await retry(() =>
      this.context.api.client.get(`/worker/processing/${processingId}`),
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

  private async cleanup({ processingId }: { processingId: string }) {
    try {
      if (!processingId) throw new Error("Processing ID not set.");

      const { system_path } = await this.getProcessingPath(processingId);
      if (fsSync.existsSync(system_path)) {
        await rimraf(system_path);
      }

      const container = await this.getProcessingContainer({ processingId });
      if (container) await container.remove({ force: true });
    } catch (error) {
      logger.error(
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
      logger.error(
        `❌ Fail to get logs from container ${container.id}. ${getErrorMessage(error)}`,
      );

      return "";
    }
  }

  private async updateProcessingFilePermissions(processing: IProcessing) {
    const environment = getSystemEnvironment();

    if (environment !== "container") {
      const { processor } = processing.data;
      const { uid, gid } = os.userInfo();

      const busyboxExists = await this.imageExists("busybox:latest");
      if (!busyboxExists) await this.pullImage("busybox:latest");

      const commands = [
        `chown -R ${uid}:${gid} ${processor.configuration.dataset_input_value}`,
        `chown -R ${uid}:${gid} ${processor.configuration.dataset_output_value}`,
        `chmod -R 777 ${processor.configuration.dataset_input_value}`,
        `chmod -R 777 ${processor.configuration.dataset_output_value}`,
      ];

      const utilContainer = await this.docker.createContainer({
        Image: "busybox",
        Cmd: ["sh", "-c", commands.join(" && ")],
        HostConfig: {
          Binds: [
            `${processing.system_input_dir}:${processor.configuration.dataset_input_value}:rw`,
            `${processing.system_output_dir}:${processor.configuration.dataset_output_value}:rw`,
          ],
        },
      });

      await utilContainer.start();
      await utilContainer.wait();
      await utilContainer.remove();
    }
  }

  private async processExecution(processingId: string) {
    try {
      const processing = await this.getProcessing(processingId);

      await this.updateProcessingFilePermissions(processing);

      const containerName = this.generateContainerName(processingId);

      const container = await this.getProcessingContainer({ processingId });

      if (!container)
        throw new WorkerError({
          key: "@processing_service_process_execution/MISSING_CONTAINER",
          message: `Unable to find container ${containerName}.`,
        });

      const containerInfo = await container.inspect();

      if (containerInfo.State.Running) {
        await retry(() =>
          this.context.api.client.post(
            `/worker/processing/${processingId}/progress`,
          ),
        );
      } else {
        const succeeded = containerInfo.State.ExitCode === 0;

        await this.updateProcessingFilePermissions(processing);

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
          });
        } else {
          await this.handleFailure({
            processingId,
            reason: `Container exited with code ${containerInfo.State.ExitCode}.`,
          });
        }
      }
    } catch (error) {
      await this.handleFailure({
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
      const { data } = await retry(() =>
        this.context.api.client.post(
          `/worker/processing/${processing.data.id}/${kind}/generate_upload`,
          fileData,
        ),
      );

      if (!data.upload_url)
        throw new WorkerError({
          key: "@processing_service_get_upload_url/MISSING_UPLOAD_URL",
          message: `Missing ${kind} upload url for processing id ${processing.data.id}.`,
        });

      return data.upload_url;
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

      logger.info(
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

      logger.info(
        `📦 Zip metrics file created for processing id ${processing.data.id}.`,
      );

      const resultFileUploadUrl = await this.getUploadUrl({
        processing,
        kind: "result_file",
        fileData: resultFile,
      });

      logger.info(
        `📦 Uploading result zip file for processing id ${processing.data.id}...`,
      );

      const resultStream = fsSync.createReadStream(resultFilePath);
      await axios.put(resultFileUploadUrl, resultStream, {
        headers: {
          "Content-Type": "application/zip",
        },
      });

      await retry(() =>
        this.context.api.client.post(
          `/worker/processing/${processing.data.id}/result_file/uploaded`,
        ),
      );

      logger.info(
        `📤 Uploaded result zip file for processing id ${processing.data.id}!`,
      );

      const metricsFileUploadUrl = await this.getUploadUrl({
        processing,
        kind: "metrics_file",
        fileData: metricsFile,
      });

      logger.info(
        `📦 Uploading metrics zip file for processing id ${processing.data.id}...`,
      );

      const metricsStream = fsSync.createReadStream(metricsFilePath);
      await axios.put(metricsFileUploadUrl, metricsStream, {
        headers: {
          "Content-Type": "application/zip",
        },
      });

      await retry(() =>
        this.context.api.client.post(
          `/worker/processing/${processing.data.id}/metrics_file/uploaded`,
        ),
      );

      logger.info(
        `📤 Uploaded metrics zip file for processing id ${processing.data.id}!`,
      );

      logger.info(
        `✅ Zip file uploaded successfully for processing id ${processing.data.id}.`,
      );
    } catch (error) {
      throw new WorkerError({
        key: "@processing_service_zip_and_upload/FAIL_TO_UPLOAD",
        message: `Fail to upload zip file for processing id ${processing.data.id}. ${getErrorMessage(error)}`,
      });
    }
  }

  private async handleSuccess({ processingId }: { processingId: string }) {
    if (!processingId) return;

    try {
      await retry(() =>
        this.context.api.client.post(
          `/worker/processing/${processingId}/success`,
        ),
      );

      await this.cleanup({
        processingId,
      });

      logger.info(`✅ Processing id ${processingId} succeeded.`);
    } catch (error) {
      logger.error(
        `❌ Fail to handle success of processing id ${processingId}. ${getErrorMessage(error)}`,
      );
    }
  }

  private async handleFailure({
    processingId,
    reason,
  }: {
    processingId: string;
    reason: string | null;
  }) {
    if (!processingId) return;

    try {
      const container = await this.getProcessingContainer({ processingId });
      if (container) {
        const logs = await this.getLatestLogsFromContainer({
          container,
          tail: 10,
        });

        if (logs)
          logger.info(
            `📄 Latest logs from container ${container.id}:\n${logs}`,
          );
      } else {
        logger.error(
          `❌ Unable to get logs from container of processing ${processingId}.`,
        );
      }

      await this.cleanup({
        processingId,
      });

      await retry(() =>
        this.context.api.client.post(
          `/worker/processing/${processingId}/failure`,
          { reason: reason ? String(reason) : null },
        ),
      );

      logger.info(`❌ Processing id ${processingId} failed. ${reason}`);
    } catch (error) {
      logger.error(
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
    const workerId = this.context.authentication.getConfig().worker_id;

    if (
      processingIds.length > 0 &&
      (this.status !== WORKER_STATUS.WORK ||
        this.processCount !== processingIds.length)
    )
      logger.info(
        `🔄 Processing ${processingIds.length} items... [Worker ID ${workerId}]`,
      );

    if (processingIds.length === 0 && this.status !== WORKER_STATUS.IDLE)
      logger.info(`🆗 Waiting for items. [Worker ID ${workerId}]`);

    this.processCount = processingIds.length;
    this.status =
      this.processCount > 0 ? WORKER_STATUS.WORK : WORKER_STATUS.IDLE;

    this.context.webSocketClient.socket.emit("worker:status", {
      status: this.status,
      version,
      processing_ids: processingIds,
      telemetry,
    });
  }

  private async process(): Promise<void> {
    try {
      if (this.context.webSocketClient.getIsConnected()) {
        const processingIds = await this.getCurrentProcessingIds();

        await this.reportStatus(processingIds);

        await processingIds.reduce<Promise<any>>((promise, processingId) => {
          return promise.then(async () => {
            return this.processExecution(processingId);
          });
        }, Promise.resolve());
      }

      this.startProcessingInterval();
    } catch (error) {
      logger.error(`❌ Fail to process items. ${getErrorMessage(error)}`);
      this.startProcessingInterval();
    }
  }
}

export { ProcessingService };
