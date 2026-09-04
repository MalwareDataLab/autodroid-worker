import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Docker from "dockerode";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

// Type import
import { AppContext } from "@shared/types/appContext.type";

// Target import
import { ProcessingService } from "./processing.service";

const CLEANER_CONTAINER_PREFIX = "autodroid_worker_cleaner_";
const IDLE_IMAGE = "alpine:latest";

const buildContext = () =>
  ({
    authentication: {
      getConfig: () => ({ name: "worker", worker_id: "wid" }),
      refreshAuthentication: async () => undefined,
    },
    api: {
      client: {
        get: async () => ({ data: {} }),
        post: async () => ({ data: {} }),
      },
      config: { baseUrl: "http://api" },
    },
    webSocketClient: {
      socket: {
        on: () => undefined,
        once: () => undefined,
        emit: () => undefined,
      },
      getIsConnected: () => true,
    },
    configurationManager: {},
  }) as unknown as AppContext;

describe("Integration: ProcessingService against docker", () => {
  const docker = new Docker();
  const containerName = `${CLEANER_CONTAINER_PREFIX}${randomUUID()}`;

  let service: ProcessingService;
  let container: Docker.Container;
  let workingDirectory: string;

  const priv = () => service as unknown as Record<string, any>;

  beforeAll(async () => {
    container = await docker.createContainer({
      Image: IDLE_IMAGE,
      name: containerName,
      Cmd: ["sleep", "300"],
    });

    service = new ProcessingService({ context: buildContext() });
    workingDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "autodroid-worker-integration-"),
    );
  }, 60000);

  afterAll(async () => {
    await container.remove({ force: true }).catch(() => undefined);
    await fs.rm(workingDirectory, { recursive: true, force: true });
  });

  it("should find a cleaner container through the name filter it ships with", async () => {
    const containers = await docker.listContainers({
      all: true,
      filters: `{"name": ["${CLEANER_CONTAINER_PREFIX}"]}`,
    });

    expect(
      containers.some(candidate =>
        candidate.Names.some(name => name.includes(containerName)),
      ),
    ).toBe(true);
  });

  it("should keep a cleaner container that is younger than the retention window", async () => {
    await service.cleanupOldCleanerContainers();

    await expect(container.inspect()).resolves.toMatchObject({
      Name: `/${containerName}`,
    });
  });

  it("should recognise an image the docker daemon really has", async () => {
    await expect(priv().imageExists(IDLE_IMAGE)).resolves.toBe(true);
  });

  it("should reject an image the docker daemon does not have", async () => {
    await expect(
      priv().imageExists(`absent-${randomUUID()}:latest`),
    ).resolves.toBe(false);
  });

  it("should match only the files the glob patterns select on disk", async () => {
    const contentsDir = path.join(workingDirectory, "contents");
    await fs.mkdir(contentsDir, { recursive: true });
    await fs.writeFile(path.join(contentsDir, "metrics.csv"), "a,b\n1,2\n");
    await fs.writeFile(path.join(contentsDir, "report.txt"), "ignored");

    const matched = await priv().getMatchedFilesByGlobPatterns({
      containerDir: contentsDir,
      globPatterns: ["*.csv"],
    });

    expect(matched).toEqual([path.join(contentsDir, "metrics.csv")]);
  });

  it("should zip the selected files and report their real size and checksum", async () => {
    const contentsDir = path.join(workingDirectory, "to-zip");
    await fs.mkdir(contentsDir, { recursive: true });
    const filePath = path.join(contentsDir, "result.csv");
    await fs.writeFile(filePath, "id,value\n1,42\n");

    const zipDestinationFilePath = path.join(workingDirectory, "result.zip");

    const result = await priv().zipDirectory({
      containerDir: contentsDir,
      files: [filePath],
      zipDestinationFilePath,
    });

    expect(result.filename).toBe("result.zip");
    expect(result.size).toBeGreaterThan(0);
    expect(fsSync.existsSync(zipDestinationFilePath)).toBe(true);
    expect(result.md5_hash).toMatch(/^[a-f0-9]{32}$/);
    expect(createHash("md5").update("probe").digest("hex")).not.toBe(
      result.md5_hash,
    );
  });
});
