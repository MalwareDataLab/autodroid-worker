import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import path from "node:path";
import Docker from "dockerode";
import { rimraf } from "rimraf";
import archiver from "archiver";
import axios from "axios";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Util import
import { sleep } from "@shared/utils/sleep.util";
import { getErrorMessage } from "@shared/utils/getErrorMessage.util";
import { getStorageBasePath } from "@shared/utils/getStorageBasePath.util";
import { promisifyWriteStream } from "@shared/utils/promisifyWriteStream.util";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";

// Type import
import { AppContext } from "@shared/types/appContext.type";
import { getSystemDynamicInfo } from "@shared/utils/getSystemDynamicInfo.util";
import {
  IProcessing,
  IProcessingFileData,
  PROCESSING_STATUS,
} from "../types/processing.types";

class ProcessingService {
  private readonly docker: Docker;
  private readonly context: AppContext;

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

  private getProcessingPath(processingId: string): string {
    const basePath = getStorageBasePath("processing");
    const processingPath = path.join(basePath, processingId);
    return processingPath;
  }

  public async init(): Promise<void> {
    await sleep(1000);
    await this.docker.ping();
    this.startProcessingInterval();

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
    if (this.processTimeout) clearTimeout(this.processTimeout);
    await this.currentProcess;
    if (this.processTimeout) clearTimeout(this.processTimeout);
    await sleep(this.processDelay);
    this.currentProcess = this.startProcessing(processingId);
  }

  private async startProcessing(processingId: string): Promise<void> {
    try {
      const processing = await this.getProcessing(processingId);

      const { processor } = processing.data;
      await this.pullImage(processor.image_tag);

      const datasetPath = path.join(
        processing.internal_input_dir,
        processing.data.dataset.file.filename,
      );
      const datasetStream = fsSync.createWriteStream(datasetPath);
      const datasetResponse = await axios.get(
        processing.data.dataset.file.public_url!,
        { responseType: "stream" },
      );
      datasetResponse.data.pipe(datasetStream);
      await promisifyWriteStream(datasetStream);

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

      const { uid } = os.userInfo();
      const container = await this.docker.createContainer({
        Image: processor.image_tag,
        Tty: true,
        HostConfig: {
          Binds: [
            `${processing.internal_input_dir}:${processor.configuration.dataset_input_value}:rw`,
            `${processing.internal_output_dir}:${processor.configuration.dataset_output_value}:rw`,
          ],
        },
        Cmd: [
          processor.configuration.command,
          uid.toString(),
          ...params.flatMap(
            ({ key, value }: { key: string; value: string }) => [
              `--${key}`,
              value,
            ],
          ),
        ],
      });

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

    const internal_working_dir = this.getProcessingPath(processingId);
    const internal_input_dir = path.join(
      internal_working_dir,
      "shared",
      "inputs",
    );
    const internal_output_dir = path.join(
      internal_working_dir,
      "shared",
      "outputs",
    );

    if (!fsSync.existsSync(internal_input_dir))
      await fsPromises.mkdir(internal_input_dir, { recursive: true });

    if (!fsSync.existsSync(internal_output_dir))
      await fsPromises.mkdir(internal_output_dir, { recursive: true });

    const configData = configuration.getConfig();

    const payload = {
      data,
      container_id: configData.container_id || null,
      internal_working_dir,
      internal_input_dir,
      internal_output_dir,
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
        const processingPath = this.getProcessingPath(processingId);
        if (fsSync.existsSync(processingPath)) {
          await rimraf(processingPath);
        }
      }
    } catch (error) {
      console.log(
        `❌ Fail to cleanup processing id ${processingId}. ${getErrorMessage(error)}`,
      );
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

        const files = await fsPromises.readdir(processing.internal_output_dir);
        if (files.length === 0) {
          console.log(
            `⭕ No files found on output directory of processing id ${processingId}`,
          );
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
    zipFilePath,
  }: {
    containerDir: string;
    zipFilePath: string;
  }): Promise<IProcessingFileData> {
    return new Promise<IProcessingFileData>((resolve, reject) => {
      const output = fsSync.createWriteStream(zipFilePath);
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
          filename: path.basename(zipFilePath),
          mime_type: "application/zip",
        });
      });

      archive.on("error", reject);

      archive.pipe(output);
      archive.directory(containerDir, false);
      archive.finalize();
    });
  }

  private async getUploadUrl({
    processing,
    fileData,
  }: {
    processing: IProcessing;
    fileData: IProcessingFileData;
  }): Promise<string> {
    if (processing.data.result_file?.upload_url)
      return processing.data.result_file.upload_url;

    try {
      const { data } = await this.context.api.client.post(
        `/worker/processing/${processing.data.id}/generate_upload`,
        fileData,
      );

      if (!data.result_file.upload_url)
        throw new WorkerError({
          key: "@processing_service_get_upload_url/MISSING_UPLOAD_URL",
          message: `Missing upload url for processing id ${processing.data.id}.`,
        });

      return data.result_file.upload_url;
    } catch (error) {
      throw new WorkerError({
        key: "@processing_service_get_upload_url/FAIL_TO_GET_UPLOAD_URL",
        message: `Fail to get upload url for processing id ${processing.data.id}. ${getErrorMessage(error)}`,
      });
    }
  }

  private async zipAndUpload(processing: IProcessing) {
    try {
      const zipFilePath = path.join(
        processing.internal_working_dir,
        `${processing.data.id}.zip`,
      );

      const fileData = await this.zipDirectory({
        containerDir: processing.internal_output_dir,
        zipFilePath,
      });

      console.log(
        `📦 Zip file created for processing id ${processing.data.id}.`,
      );

      const uploadUrl = await this.getUploadUrl({ processing, fileData });

      console.log(
        `📦 Uploading zip file for processing id ${processing.data.id}...`,
      );

      const stream = fsSync.createReadStream(zipFilePath);
      await axios.put(uploadUrl, stream, {
        headers: {
          "Content-Type": "application/zip",
        },
      });

      await this.context.api.client.post(
        `/worker/processing/${processing.data.id}/uploaded`,
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

    if (processingIds.length > 0) {
      this.context.webSocketClient.socket.emit("worker:status", {
        status: "WORK",
        processing_ids: processingIds,
        telemetry,
      });
    } else {
      this.context.webSocketClient.socket.emit("worker:status", {
        status: "IDLE",
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
