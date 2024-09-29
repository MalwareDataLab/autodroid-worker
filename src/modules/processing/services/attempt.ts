import Docker, { Container } from "dockerode";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import axios from "axios"; // For sending files to the API
import FormData from "form-data"; // Import form-data package
import { Readable } from "node:stream";
import { rimraf } from "rimraf";
import os from "node:os";
// To delete folders
class DockerManager {
  private docker: Docker;
  private runningContainers: Map<string, Container> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private apiUrl: string = "https://your-api.com/status";

  constructor() {
    this.docker = new Docker();
    this.startContainerMonitor();
  }

  // Pull an image with progress logging
  public async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(
          stream,
          (progressError: Error | null, _: any) => {
            if (progressError) {
              reject(err);
              return;
            }

            console.log(`Image ${imageName} pulled successfully`);
            resolve();
          },
          (event: any) => {
            const progress = event.progressDetail || {};
            const percentage = (progress.current / progress.total) * 100 || 0;
            console.log(`Pulling ${imageName}: ${percentage.toFixed(2)}%`);
          },
        );
      });
    });
  }

  // Helper to handle Docker stream
  private async handleStream(stream: NodeJS.ReadableStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.on("data", data => console.log(`Docker exec output: ${data}`));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }

  // Start a container and handle lifecycle
  public async startContainer(
    imageName: string,
    containerDir: string,
  ): Promise<void> {
    const uid = process.getuid ? process.getuid() : 1000; // Get user ID, default to 1000 (non-root)
    const gid = process.getgid ? process.getgid() : 1000; // Get group ID, default to 1000 (non-root)

    // Create local directories
    fs.mkdirSync(containerDir);
    fs.mkdirSync(`${containerDir}/inputs`);
    fs.mkdirSync(`${containerDir}/outputs`);

    const container = await this.docker.createContainer({
      Image: imageName,
      Tty: true,
      HostConfig: {
        Binds: [
          `${containerDir}/inputs:/droidaugmentor/shared/inputs:rw`,
          `${containerDir}/outputs:/droidaugmentor/shared/outputs:rw`,
        ],
      },
      Cmd: [
        "/droidaugmentor/shared/app_run.sh",
        "--output_dir",
        "/droidaugmentor/shared/outputs",
        "20",
      ],
      // User: "root",
    });
    try {
      await container.start();

      const execInstance = await container.exec({
        Cmd: ["chmod", "-R", `777`, "/droidaugmentor/shared"],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await execInstance.start({ hijack: true, stdin: false });
      await this.handleStream(stream);

      console.log(`Container ${container.id} started.`);

      this.runningContainers.set(container.id, container);
      this.monitorContainer(container, containerDir);
    } catch (error: any) {
      console.log(error);
      // await this.cleanupContainer(container.id, containerDir);
    }
  }

  // Monitor container and handle success/failure
  private async monitorContainer(
    container: Container,
    containerDir: string,
  ): Promise<void> {
    container.wait(async (err, data) => {
      if (err) {
        console.error(
          `Error waiting for container ${container.id}: ${err.message}`,
        );
        return;
      }

      const status = data.StatusCode === 0 ? "succeeded" : "failed";
      console.log(`Container ${container.id} ${status}.`);

      this.handleContainerCompletion(containerDir, container.id, status)
        .then(() => {
          this.runningContainers.delete(container.id);
        })
        .catch(error =>
          console.error(
            `Error handling container completion: ${error.message}`,
          ),
        );
    });
  }

  // Check container status periodically
  private startContainerMonitor(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(
      async () => {
        if (this.runningContainers.size === 0) {
          console.log("No running containers. Reporting IDLE.");
          await this.reportIdleStatus();
          return;
        }

        console.log("Checking container statuses...");
        const statusChecks = Array.from(this.runningContainers.entries()).map(
          async ([containerId]) => {
            const isRunning = await this.checkContainer(containerId);
            console.log(`Container ${containerId} is running: ${isRunning}`);
          },
        );

        await Promise.all(statusChecks);
      },
      3 * 60 * 1000,
    ); // Check every 3 minutes
  }

  // Handle logs from a container
  public async getContainerLogs(containerId: string): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const logsStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    });

    return logsStream.toString("utf-8");
  }

  // Stream helper function
  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      stream.on("error", reject);
    });
  }

  // Zip the working directory of a container
  private async zipDirectory(
    containerDir: string,
    zipFilePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        console.log(`${archive.pointer()} total bytes`);
        console.log("Archiver has been finalized.");
        resolve();
      });

      archive.on("error", reject);

      archive.pipe(output);
      archive.directory(containerDir, false);
      archive.finalize();
    });
  }

  // Handle container completion and send files
  private async handleContainerCompletion(
    containerDir: string,
    containerId: string,
    status: string,
  ): Promise<void> {
    const zipFilePath = path.join(containerDir, `${containerId}.zip`);
    await this.zipDirectory(containerDir, zipFilePath);

    console.log("Sending zip to API...");
    await this.sendFilesToAPI(zipFilePath, status);

    console.log("Cleaning up container and local files...");
    // await this.cleanupContainer(containerId, containerDir);
  }

  // Send files to the API
  private async sendFilesToAPI(
    zipFilePath: string,
    status: string,
  ): Promise<void> {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(zipFilePath));
    formData.append("status", status);

    try {
      console.log(JSON.stringify(formData, null, 2));

      /*  const response = await axios.post("https://your-api.com/upload", {
        headers: { ...formData.getHeaders() },
      });
      console.log(`File sent successfully: ${response.status}`); */
    } catch (err: any) {
      console.error(`Error sending file: ${err.message}`);
    }
  }

  // Clean up local files and remove Docker container
  private async cleanupContainer(
    containerId: string,
    containerDir: string,
  ): Promise<void> {
    try {
      // Remove container
      const container = this.docker.getContainer(containerId);
      await container.remove({ force: true });
      console.log(`Container ${containerId} removed.`);

      // Delete local directory
      await rimraf(containerDir);
      console.log(`Directory ${containerDir} cleaned up.`);
    } catch (err: any) {
      console.error(`Error during cleanup: ${err.message}`);
    }
  }

  // Check container status
  public async checkContainer(containerId: string): Promise<boolean> {
    const container = this.docker.getContainer(containerId);
    const data = await container.inspect();
    return data.State.Running;
  }

  // Report IDLE status to the API
  private async reportIdleStatus(): Promise<void> {
    try {
      const response = await axios.post(this.apiUrl, { status: "IDLE" });
      console.log(`IDLE status reported: ${response.status}`);
    } catch (err: any) {
      console.error(`Error reporting IDLE status: ${err.message}`);
    }
  }

  // Get all container logs (past and present)
  public async getAllContainerLogs(): Promise<string[]> {
    const containers = await this.docker.listContainers({ all: true });
    const logsPromises = containers.map(containerInfo =>
      this.getContainerLogs(containerInfo.Id),
    );
    return Promise.all(logsPromises);
  }
}

export { DockerManager };
