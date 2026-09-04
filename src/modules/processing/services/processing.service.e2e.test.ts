import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Processing } from "autodroid";

// Type import
import { AppContext } from "@shared/types/appContext.type";

// Fixture import
import { E2E_TOOL_IMAGE } from "@/test/fixtures/e2e-tool/image";

// Target import
import { ProcessingService } from "./processing.service";

const FORCE_FAIL_COMMAND = "autodroid-e2e-force-fail";
const STDOUT_ONLY_COMMAND = "autodroid-e2e-stdout-only";

type RecordedCall = { method: "GET" | "POST"; url: string; body?: unknown };

const buildProcessingRecord = ({
  id,
  command,
  datasetPublicUrl,
}: {
  id: string;
  command: string;
  datasetPublicUrl: string;
}): Processing =>
  ({
    id,
    status: "PENDING",
    configuration: [],
    dataset: {
      file: {
        filename: "dataset.csv",
        allow_public_access: true,
        public_url: datasetPublicUrl,
        public_url_expires_at: new Date(
          Date.now() + 60 * 60 * 1000,
        ).toISOString(),
      },
    },
    processor: {
      image_tag: E2E_TOOL_IMAGE,
      configuration: {
        command,
        dataset_input_argument: "input",
        dataset_input_value: "/input",
        dataset_output_argument: "output",
        dataset_output_value: "/output",
        output_result_file_glob_patterns: ["result.csv"],
        output_metrics_file_glob_patterns: ["metrics.csv"],
        parameters: [],
      },
    },
    result_file: null,
    metrics_file: null,
  }) as unknown as Processing;

const buildStubApiClient = ({
  processingRecord,
  stubBaseUrl,
}: {
  processingRecord: Processing;
  stubBaseUrl: string;
}) => {
  const calls: RecordedCall[] = [];
  const ackEndpoints = new Set([
    `/worker/processing/${processingRecord.id}/progress`,
    `/worker/processing/${processingRecord.id}/result_file/uploaded`,
    `/worker/processing/${processingRecord.id}/metrics_file/uploaded`,
    `/worker/processing/${processingRecord.id}/success`,
    `/worker/processing/${processingRecord.id}/failure`,
  ]);

  const client = {
    get: async (url: string) => {
      calls.push({ method: "GET", url });
      if (url === `/worker/processing/${processingRecord.id}`)
        return { data: processingRecord };
      throw new Error(`Unexpected stub GET ${url}`);
    },
    post: async (url: string, body?: unknown) => {
      calls.push({ method: "POST", url, body });
      if (
        url ===
        `/worker/processing/${processingRecord.id}/result_file/generate_upload`
      )
        return { data: { upload_url: `${stubBaseUrl}/upload/result` } };
      if (
        url ===
        `/worker/processing/${processingRecord.id}/metrics_file/generate_upload`
      )
        return { data: { upload_url: `${stubBaseUrl}/upload/metrics` } };
      if (ackEndpoints.has(url)) return { data: {} };
      throw new Error(`Unexpected stub POST ${url}`);
    },
  };

  return { client, calls };
};

const createStubStorageServer = ({
  datasetContent,
}: {
  datasetContent: string;
}) =>
  new Promise<{
    server: http.Server;
    baseUrl: string;
    uploads: Record<string, Buffer>;
  }>(resolve => {
    const uploads: Record<string, Buffer> = {};

    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/dataset.csv") {
        res.writeHead(200, { "Content-Type": "text/csv" });
        res.end(datasetContent);
        return;
      }

      if (
        req.method === "PUT" &&
        (req.url === "/upload/result" || req.url === "/upload/metrics")
      ) {
        const chunks: Buffer[] = [];
        req.on("data", chunk => chunks.push(chunk as Buffer));
        req.on("end", () => {
          uploads[req.url as string] = Buffer.concat(chunks);
          res.writeHead(200);
          res.end();
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, uploads });
    });
  });

const execFileAsync = promisify(execFile);

const readZipEntry = async (zipBuffer: Buffer, entryName: string) => {
  const zipPath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "autodroid-worker-e2e-zip-")),
    "archive.zip",
  );
  await fs.writeFile(zipPath, zipBuffer);
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entryName]);
  return stdout;
};

const buildContext = ({
  client,
  workerName,
}: {
  client: unknown;
  workerName: string;
}) =>
  ({
    authentication: {
      getConfig: () => ({ name: workerName, worker_id: "e2e-wid" }),
      refreshAuthentication: async () => undefined,
    },
    api: {
      client,
      config: { baseUrl: "http://stub" },
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

describe("E2E: ProcessingService full pipeline against real docker and a real local stub", () => {
  let activeServices: ProcessingService[] = [];

  afterEach(() => {
    activeServices.forEach(service => {
      const priv = service as unknown as Record<string, any>;
      if (priv.processTimeout) clearTimeout(priv.processTimeout);
    });
    activeServices = [];
  });

  it("should acquire, run in a real container, zip real output, upload it and report success", async () => {
    const processingId = `e2e-success-${randomUUID()}`;
    const { server, baseUrl, uploads } = await createStubStorageServer({
      datasetContent: "col_a,col_b\n1,2\n",
    });

    try {
      const processingRecord = buildProcessingRecord({
        id: processingId,
        command: "run",
        datasetPublicUrl: `${baseUrl}/dataset.csv`,
      });
      const { client, calls } = buildStubApiClient({
        processingRecord,
        stubBaseUrl: baseUrl,
      });

      const service = new ProcessingService({
        context: buildContext({
          client,
          workerName: `e2e-worker-${randomUUID()}`,
        }),
      });
      activeServices.push(service);
      const priv = service as unknown as Record<string, any>;

      await service.dispatchProcessing(processingId);
      await priv.currentProcess;
      clearTimeout(priv.processTimeout);
      await priv.processExecution(processingId);

      const resultCsv = await readZipEntry(
        uploads["/upload/result"]!,
        "result.csv",
      );
      const metricsCsv = await readZipEntry(
        uploads["/upload/metrics"]!,
        "metrics.csv",
      );
      expect(resultCsv).toBe("synthetic-result-row-1,synthetic-result-row-2\n");
      expect(metricsCsv).toBe(
        "synthetic-metric-row-1,synthetic-metric-row-2\n",
      );

      const postedUrls = calls
        .filter(call => call.method === "POST")
        .map(call => call.url);
      expect(postedUrls).toContain(
        `/worker/processing/${processingId}/success`,
      );
      expect(postedUrls).not.toContain(
        `/worker/processing/${processingId}/failure`,
      );
    } finally {
      server.close();
    }
  }, 30000);

  it("should mark processing as failed and report the exit code when the container exits non-zero", async () => {
    const processingId = `e2e-failure-${randomUUID()}`;
    const { server, baseUrl } = await createStubStorageServer({
      datasetContent: "col_a,col_b\n1,2\n",
    });

    try {
      const processingRecord = buildProcessingRecord({
        id: processingId,
        command: FORCE_FAIL_COMMAND,
        datasetPublicUrl: `${baseUrl}/dataset.csv`,
      });
      const { client, calls } = buildStubApiClient({
        processingRecord,
        stubBaseUrl: baseUrl,
      });

      const service = new ProcessingService({
        context: buildContext({
          client,
          workerName: `e2e-worker-${randomUUID()}`,
        }),
      });
      activeServices.push(service);
      const priv = service as unknown as Record<string, any>;

      await service.dispatchProcessing(processingId);
      await priv.currentProcess;
      await priv.processExecution(processingId);

      const failureCall = calls.find(
        call =>
          call.method === "POST" &&
          call.url === `/worker/processing/${processingId}/failure`,
      );
      expect(failureCall).toBeDefined();
      expect(failureCall?.body).toMatchObject({
        reason: expect.stringContaining("Container exited with code 7"),
      });

      const postedUrls = calls
        .filter(call => call.method === "POST")
        .map(call => call.url);
      expect(postedUrls).not.toContain(
        `/worker/processing/${processingId}/success`,
      );
    } finally {
      server.close();
    }
  }, 30000);

  it("should fall back to the captured container log as the result when the tool writes no output files", async () => {
    const processingId = `e2e-stdout-only-${randomUUID()}`;
    const { server, baseUrl, uploads } = await createStubStorageServer({
      datasetContent: "col_a,col_b\n1,2\n",
    });

    try {
      const processingRecord = buildProcessingRecord({
        id: processingId,
        command: STDOUT_ONLY_COMMAND,
        datasetPublicUrl: `${baseUrl}/dataset.csv`,
      });
      const { client, calls } = buildStubApiClient({
        processingRecord,
        stubBaseUrl: baseUrl,
      });

      const service = new ProcessingService({
        context: buildContext({
          client,
          workerName: `e2e-worker-${randomUUID()}`,
        }),
      });
      activeServices.push(service);
      const priv = service as unknown as Record<string, any>;

      await service.dispatchProcessing(processingId);
      await priv.currentProcess;
      clearTimeout(priv.processTimeout);
      await priv.processExecution(processingId);

      const capturedLog = await readZipEntry(
        uploads["/upload/result"]!,
        `_autodroid_worker_processing_${processingId}_output.log`,
      );
      expect(capturedLog.toString()).toContain("synthetic-stdout-only-output");
      expect(uploads["/upload/metrics"]).toBeUndefined();

      const postedUrls = calls
        .filter(call => call.method === "POST")
        .map(call => call.url);
      expect(postedUrls).toContain(
        `/worker/processing/${processingId}/success`,
      );
      expect(postedUrls).not.toContain(
        `/worker/processing/${processingId}/failure`,
      );
    } finally {
      server.close();
    }
  }, 30000);
});
