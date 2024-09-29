import Docker from "dockerode";
import fs from "node:fs";
import path from "node:path";
import { Socket } from "socket.io-client";

class JobWorker {
  private isInsideDocker: boolean;
  private docker: Docker;
  private isIdle: boolean;
  private currentJob: any;
  private logStream: any;

  constructor(private socket: Socket) {
    this.isInsideDocker = fs.existsSync("/.dockerenv");
    this.docker = new Docker({
      socketPath: this.isInsideDocker
        ? "/var/run/docker.sock"
        : "/var/run/docker.sock",
    });
    this.isIdle = true;
    this.currentJob = null;
    this.logStream = null;
  }

  private reportStatus(status: string, additionalData: any = {}) {
    this.socket.emit("worker-status", { status, ...additionalData });
  }

  private handleError(error: any, context: any) {
    console.error(`${context}: ${error.message}`);
    this.reportStatus("error", { error: error.message });
    this.isIdle = true;
    this.reportStatus("idle");
  }

  private async monitorContainer(container: any) {
    try {
      const result = await container.wait();
      this.logStream.destroy();

      if (result.StatusCode === 0) {
        const outputDir = path.join("/data", "output");
        const files = fs.readdirSync(outputDir);
        this.reportStatus("success", { files });
      } else {
        this.reportStatus("failure", {
          error: `Container exited with code ${result.StatusCode}`,
        });
      }
    } catch (error) {
      this.handleError(error, "Error monitoring container");
    } finally {
      try {
        await container.remove();
      } catch (error) {
        this.handleError(error, "Error removing container");
      }
      this.isIdle = true;
      this.reportStatus("idle");
    }
  }

  public start() {
    this.socket.on("connect", () => {
      this.reportStatus("connected");

      if (this.isIdle) {
        this.reportStatus("idle");
      }
    });

    this.socket.on("new-job", async jobData => {
      if (this.isIdle) {
        this.currentJob = jobData;
        this.isIdle = false;
        this.reportStatus("processing", { jobId: this.currentJob.id });

        try {
          await this.startJob(this.currentJob);
        } catch (error) {
          this.handleError(error, "Error processing job");
        }
      }
    });

    this.socket.on("cancel-job", async () => {
      if (!this.isIdle && this.currentJob) {
        try {
          const container = this.docker.getContainer(this.currentJob.id);
          await container.stop();
          this.reportStatus("cancelled");
        } catch (error) {
          this.handleError(error, "Error cancelling job");
        } finally {
          this.isIdle = true;
        }
      }
    });

    setInterval(() => {
      if (!this.isIdle && this.logStream) {
        this.reportStatus("running");
      }
    }, 60000);
  }

  private async startJob(jobData: any) {
    const { image, params, datasetPath } = jobData;

    try {
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: params,
        HostConfig: {
          Binds: [`${datasetPath}:/data`],
        },
        User: this.isInsideDocker ? "1000:1000" : undefined,
      });

      this.logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      });

      this.logStream.on("data", (chunk: any) => {
        const log = chunk.toString();
        console.log(log);
        this.reportStatus("running", { log });
      });

      await container.start();

      await this.monitorContainer(container);
    } catch (error) {
      this.handleError(error, "Error starting Docker container");
    }
  }
}

export { JobWorker };
