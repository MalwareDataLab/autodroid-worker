import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";
import { AppContext } from "@shared/types/appContext.type";

// Test target import
import { ProcessingService } from "./processing.service";

const makeEmitter = () => {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  return {
    handlers,
    on: vi.fn(function onHandler(this: unknown, event: string, cb: () => void) {
      handlers[event] = cb;
      return this;
    }),
    once: vi.fn(function onceHandler(
      this: unknown,
      event: string,
      cb: () => void,
    ) {
      handlers[event] = cb;
      return this;
    }),
    emit(event: string, arg?: unknown) {
      if (handlers[event]) handlers[event](arg);
    },
    pipe: vi.fn(),
  };
};

let writables: ReturnType<typeof makeEmitter>[] = [];
let archivers: Array<ReturnType<typeof makeEmitter> & Record<string, any>> = [];
let hashUpdate: ReturnType<typeof vi.fn>;
let workerErrorMake: MockInstance<typeof WorkerError.make>;
const state = { archiverError: false };

const m = vi.hoisted(() => {
  const container = {
    id: "cid",
    start: vi.fn(),
    wait: vi.fn(),
    remove: vi.fn(),
    inspect: vi.fn(),
    logs: vi.fn(),
  };
  const docker = {
    ping: vi.fn(),
    version: vi.fn(),
    listVolumes: vi.fn(),
    listContainers: vi.fn(),
    listImages: vi.fn(),
    getContainer: vi.fn(),
    pull: vi.fn(),
    createContainer: vi.fn(),
    modem: { followProgress: vi.fn() },
  };
  const DockerCtor = vi.fn(function DockerConstructor(
    this: unknown,
    opts: unknown,
  ) {
    (docker as Record<string, unknown>).__opts = opts;
    return docker;
  });
  const configMock = {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    setConfigValue: vi.fn(),
  };
  return {
    container,
    docker,
    DockerCtor,
    configMock,
    rimraf: vi.fn(),
    archiver: vi.fn(),
    axios: { get: vi.fn(), put: vi.fn() },
    semver: { lt: vi.fn() },
    glob: vi.fn(),
    fsSync: {
      existsSync: vi.fn(),
      createWriteStream: vi.fn(),
      createReadStream: vi.fn(),
      lstatSync: vi.fn(),
    },
    fsPromises: {
      unlink: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
    },
    crypto: { createHash: vi.fn(), randomUUID: vi.fn(() => "uuid") },
    os: { userInfo: vi.fn(() => ({ uid: 1000, gid: 1000 })) },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    sleep: vi.fn(() => Promise.resolve()),
    now: vi.fn(() => ({ isAfter: vi.fn(() => false) })),
    getErrorMessage: vi.fn(() => "err"),
    getSystemDynamicInfo: vi.fn(async () => ({ cpu: 1 })),
    getSystemEnvironment: vi.fn(() => "test"),
    getStorageBasePath: vi.fn(() => "/base/system"),
    getStorageBaseFolder: vi.fn(() => "base/folder"),
    promisifyWriteStream: vi.fn(() => Promise.resolve()),
    ConfigurationManagerService: vi.fn(),
  };
});

vi.mock("dockerode", () => ({ default: m.DockerCtor }));
vi.mock("rimraf", () => ({ rimraf: m.rimraf }));
vi.mock("archiver", () => ({ default: m.archiver }));
vi.mock("axios", () => ({
  default: {
    get: m.axios.get,
    put: m.axios.put,
    isAxiosError: vi.fn(() => false),
  },
}));
vi.mock("semver", () => ({ default: { lt: m.semver.lt } }));
vi.mock("glob", () => ({ glob: m.glob }));
vi.mock("node:fs/promises", () => ({ default: m.fsPromises }));
vi.mock("node:fs", () => ({ default: m.fsSync }));
vi.mock("node:crypto", () => ({
  default: m.crypto,
  randomUUID: m.crypto.randomUUID,
}));
vi.mock("node:os", () => ({ default: m.os }));
vi.mock("@config/env", () => ({
  getEnvConfig: vi.fn(() => ({
    isTestEnv: true,
    APP_INFO: { version: "1.0.0", name: "autodroid" },
    WORKER_ID: "w",
    NAME: "n",
    NODE_ENV: "test",
    DEBUG: false,
  })),
}));
vi.mock("@shared/utils/getStorageBasePath.util", () => ({
  getStorageBasePath: m.getStorageBasePath,
  getStorageBaseFolder: m.getStorageBaseFolder,
}));
vi.mock("@shared/utils/logger", () => ({ logger: m.logger }));
vi.mock("@shared/utils/sleep.util", () => ({ sleep: m.sleep }));
vi.mock("@shared/utils/dateHelper.util", () => ({
  DateHelpers: { now: m.now },
}));
vi.mock("@shared/utils/retryExecution.util", () => ({
  retryExecution: () => (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@shared/utils/getErrorMessage.util", () => ({
  getErrorMessage: m.getErrorMessage,
}));
vi.mock("@shared/utils/getSystemDynamicInfo.util", () => ({
  getSystemDynamicInfo: m.getSystemDynamicInfo,
}));
vi.mock("@shared/utils/getSystemEnvironment.util", () => ({
  getSystemEnvironment: m.getSystemEnvironment,
}));
vi.mock("@shared/utils/promisifyWriteStream.util", () => ({
  promisifyWriteStream: m.promisifyWriteStream,
}));
vi.mock("@modules/configuration/services/configurationManager.service", () => ({
  ConfigurationManagerService: m.ConfigurationManagerService,
}));

const makeProcessing = (dataOverrides: Record<string, unknown> = {}) => ({
  configuration: m.configMock,
  data: {
    id: "p1",
    status: "RUNNING",
    processor: {
      image_tag: "img:tag",
      configuration: {
        dataset_input_argument: "in-arg",
        dataset_input_value: "/in",
        dataset_output_argument: "out-arg",
        dataset_output_value: "/out",
        command: "run",
        output_result_file_glob_patterns: ["*.txt"],
        output_metrics_file_glob_patterns: ["*.json"],
      },
    },
    configuration: [{ key: "c", value: "1" }],
    dataset: {
      file: {
        filename: "ds.csv",
        public_url: "http://file",
        public_url_expires_at: "2030-01-01T00:00:00Z",
        allow_public_access: true,
      },
    },
    result_file: null,
    metrics_file: null,
    ...dataOverrides,
  },
  container_id: null,
  internal_status: "PENDING",
  system_working_dir: "/w",
  system_input_dir: "/w/in",
  system_output_dir: "/w/out",
  volume_working_dir: "vw",
  volume_input_dir: "vin",
  volume_output_dir: "vout",
});

const buildContext = () => ({
  authentication: {
    getConfig: vi.fn(() => ({ name: "worker", worker_id: "wid" })),
    refreshAuthentication: vi.fn(),
  },
  api: {
    client: { get: vi.fn(), post: vi.fn() },
    config: { baseUrl: "http://api" },
  },
  webSocketClient: {
    socket: { on: vi.fn(), once: vi.fn(), emit: vi.fn() },
    getIsConnected: vi.fn(() => true),
  },
  configurationManager: {},
});

let context: ReturnType<typeof buildContext>;
let service: ProcessingService;
const priv = () => service as unknown as Record<string, any>;

describe("Service: ProcessingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    writables = [];
    archivers = [];
    state.archiverError = false;

    m.fsSync.existsSync.mockReturnValue(true);
    m.fsSync.createWriteStream.mockImplementation(() => {
      const s = makeEmitter();
      writables.push(s);
      return s;
    });
    m.fsSync.createReadStream.mockReturnValue({ read: true });
    m.fsSync.lstatSync.mockReturnValue({ isDirectory: () => true });
    m.fsPromises.unlink.mockResolvedValue(undefined);
    m.fsPromises.mkdir.mockResolvedValue(undefined);
    m.fsPromises.writeFile.mockResolvedValue(undefined);
    m.fsPromises.readdir.mockResolvedValue(["file.txt"]);
    hashUpdate = vi.fn();
    m.crypto.createHash.mockReturnValue({
      update: hashUpdate,
      digest: vi.fn(() => "md5hash"),
    });
    m.archiver.mockImplementation(() => {
      const archive = makeEmitter() as ReturnType<typeof makeEmitter> &
        Record<string, any>;
      archive.file = vi.fn();
      archive.pointer = vi.fn(() => 999);
      archive.pipe = vi.fn((out: unknown) => {
        archive._output = out;
        return out;
      });
      archive.finalize = vi.fn(() => {
        if (state.archiverError) {
          archive.emit("error", new Error("zip fail"));
          return;
        }
        archive.emit("data", Buffer.from("x"));
        (archive._output as ReturnType<typeof makeEmitter>).emit("close");
      });
      archivers.push(archive);
      return archive;
    });
    m.axios.get.mockResolvedValue({ data: makeEmitter() });
    m.axios.put.mockResolvedValue({ status: 200 });
    m.semver.lt.mockReturnValue(false);
    m.glob.mockResolvedValue([]);
    m.getSystemEnvironment.mockReturnValue("test");
    m.now.mockReturnValue({ isAfter: vi.fn(() => false) });

    m.docker.ping.mockResolvedValue(undefined);
    m.docker.version.mockResolvedValue({ Version: "26.0.0" });
    m.docker.listVolumes.mockResolvedValue({ Volumes: [] });
    m.docker.listContainers.mockResolvedValue([]);
    m.docker.listImages.mockResolvedValue([]);
    m.docker.getContainer.mockReturnValue(m.container);
    m.docker.createContainer.mockResolvedValue(m.container);
    m.container.start.mockResolvedValue(undefined);
    m.container.wait.mockResolvedValue(undefined);
    m.container.remove.mockResolvedValue(undefined);
    m.container.inspect.mockResolvedValue({
      State: { Running: false, ExitCode: 0 },
      Created: new Date().toISOString(),
    });
    m.container.logs.mockResolvedValue(Buffer.from("logs"));

    m.configMock.getConfig.mockReturnValue({});
    m.configMock.setConfig.mockResolvedValue(undefined);
    m.configMock.setConfigValue.mockResolvedValue(undefined);
    m.ConfigurationManagerService.mockImplementation(() => m.configMock);

    workerErrorMake = vi.spyOn(WorkerError, "make");

    context = buildContext();
    service = new ProcessingService({
      context: context as unknown as AppContext,
    });
  });

  afterEach(() => {
    workerErrorMake.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should build docker with socket path when the docker sock exists", () => {
      expect(service).toBeInstanceOf(ProcessingService);
      expect(m.DockerCtor).toHaveBeenCalledWith({
        socketPath: "/var/run/docker.sock",
      });
    });

    it("should build docker with host and port when the docker sock is missing", () => {
      m.fsSync.existsSync.mockReturnValueOnce(false);

      // eslint-disable-next-line no-new -- constructed for its docker-client-setup side effect, the instance itself is never used
      new ProcessingService({ context: context as unknown as AppContext });

      expect(m.DockerCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({ host: process.env.DOCKER_HOST }),
      );
    });
  });

  describe("cleanupOldCleanerContainers", () => {
    it("should remove containers older than five minutes", async () => {
      m.docker.listContainers.mockResolvedValueOnce([
        { Id: "1", Names: ["/autodroid_worker_cleaner_x"] },
      ]);
      m.container.inspect.mockResolvedValueOnce({
        Created: new Date(0).toISOString(),
      });

      await service.cleanupOldCleanerContainers();

      expect(m.container.remove).toHaveBeenCalledWith({ force: true });
    });

    it("should keep recent cleaner containers", async () => {
      m.docker.listContainers.mockResolvedValueOnce([
        { Id: "1", Names: ["/autodroid_worker_cleaner_x"] },
      ]);
      m.container.inspect.mockResolvedValueOnce({
        Created: new Date().toISOString(),
      });

      await service.cleanupOldCleanerContainers();

      expect(m.container.remove).not.toHaveBeenCalled();
    });

    it("should log an error when listing containers fails", async () => {
      m.docker.listContainers.mockRejectedValueOnce(new Error("boom"));

      await service.cleanupOldCleanerContainers();

      expect(workerErrorMake).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "@processing_service_cleanup_old_cleaner_containers/FAIL_TO_CLEANUP",
        }),
      );
      expect(m.logger.error).toHaveBeenCalled();
    });
  });

  describe("checkDefaultVolume", () => {
    it("should do nothing outside a container environment", async () => {
      await priv().checkDefaultVolume();

      expect(m.docker.listVolumes).not.toHaveBeenCalled();
    });

    it("should pass when the volume exists in a container environment", async () => {
      m.getSystemEnvironment.mockReturnValue("container");
      m.docker.listVolumes.mockResolvedValueOnce({
        Volumes: [{ Name: "autodroid_worker_data" }],
      });
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await priv().checkDefaultVolume();

      expect(exit).not.toHaveBeenCalled();
      exit.mockRestore();
    });

    it("should exit when the volume is missing in a container environment", async () => {
      m.getSystemEnvironment.mockReturnValue("container");
      m.docker.listVolumes.mockResolvedValueOnce({ Volumes: [] });
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      await priv().checkDefaultVolume();

      expect(exit).toHaveBeenCalledWith(1);
      exit.mockRestore();
    });
  });

  describe("init", () => {
    it("should initialize and wire the websocket listeners", async () => {
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});
      vi.spyOn(service, "dispatchProcessing").mockResolvedValue(undefined);
      vi.spyOn(priv(), "reportStatus").mockResolvedValue(undefined);
      vi.spyOn(priv(), "getCurrentProcessingIds").mockResolvedValue([]);

      await service.init();

      const onCalls = (context.webSocketClient.socket.on as any).mock.calls;
      const work = onCalls.find((c: any[]) => c[0] === "worker:work")[1];
      const getStatus = onCalls.find(
        (c: any[]) => c[0] === "worker:get-status",
      )[1];

      work({ processing_id: "abc" });
      expect(service.dispatchProcessing).toHaveBeenCalledWith("abc");

      await getStatus();
      expect(priv().reportStatus).toHaveBeenCalledWith([]);
    });

    it("should throw when the docker version is not supported", async () => {
      m.semver.lt.mockReturnValueOnce(true);
      m.docker.version.mockResolvedValueOnce({ Version: "25.0.0" });

      await expect(service.init()).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_init/UNSUPPORTED_DOCKER_VERSION",
        }),
      );
    });
  });

  describe("dispatchProcessing", () => {
    it("should start processing when it is not already running", async () => {
      vi.spyOn(priv(), "getCurrentProcessingIds").mockResolvedValue([]);
      const start = vi
        .spyOn(priv(), "startProcessing")
        .mockResolvedValue(undefined);
      priv().processTimeout = setTimeout(() => {}, 1000);

      await service.dispatchProcessing("p1");

      expect(start).toHaveBeenCalledWith("p1");
    });

    it("should skip processing that is already in progress", async () => {
      vi.spyOn(priv(), "getCurrentProcessingIds").mockResolvedValue(["p1"]);
      const start = vi
        .spyOn(priv(), "startProcessing")
        .mockResolvedValue(undefined);

      await service.dispatchProcessing("p1");

      expect(start).not.toHaveBeenCalled();
      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Skipping processing p1"),
      );
    });

    it("should skip when waiting for the current process times out", async () => {
      priv().currentProcess = new Promise(() => {});
      const start = vi
        .spyOn(priv(), "startProcessing")
        .mockResolvedValue(undefined);

      const promise = service.dispatchProcessing("p1");
      await vi.advanceTimersByTimeAsync(15000);
      await promise;

      expect(start).not.toHaveBeenCalled();
      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Skipping processing p1"),
      );
    });
  });

  describe("pullImage", () => {
    it("should resolve immediately when the image already exists", async () => {
      m.docker.listImages.mockResolvedValueOnce([{ RepoTags: ["img:tag"] }]);

      await expect(priv().pullImage("img:tag")).resolves.toBeUndefined();
      expect(m.docker.pull).not.toHaveBeenCalled();
    });

    it("should handle images without repo tags and pull when missing", async () => {
      m.docker.listImages.mockResolvedValueOnce([{}]);
      m.docker.pull.mockImplementationOnce((_img: string, cb: any) =>
        cb(null, "stream"),
      );
      m.docker.modem.followProgress.mockImplementationOnce(
        (_s: unknown, cb: any) => cb(null),
      );

      await expect(priv().pullImage("img:tag")).resolves.toBeUndefined();
      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("pulled successfully"),
      );
    });

    it("should reject when the pull fails", async () => {
      m.docker.pull.mockImplementationOnce((_img: string, cb: any) =>
        cb(new Error("pull error")),
      );

      await expect(priv().pullImage("img:tag")).rejects.toThrow("pull error");
    });

    it("should reject when following progress fails", async () => {
      const progressError = new Error("progress error");
      m.docker.pull.mockImplementationOnce((_img: string, cb: any) =>
        cb(null, "stream"),
      );
      m.docker.modem.followProgress.mockImplementationOnce(
        (_s: unknown, cb: any) => cb(progressError),
      );

      await expect(priv().pullImage("img:tag")).rejects.toBe(progressError);
    });
  });

  describe("getProcessingContainer", () => {
    it("should return null when no container matches", async () => {
      m.docker.listContainers.mockResolvedValueOnce([]);

      await expect(
        priv().getProcessingContainer({ processingId: "p1" }),
      ).resolves.toBeNull();
    });

    it("should return the container when it matches", async () => {
      m.docker.listContainers.mockResolvedValueOnce([{ Id: "cid" }]);

      await expect(
        priv().getProcessingContainer({ processingId: "p1" }),
      ).resolves.toBe(m.container);
    });

    it("should throw when listing containers fails", async () => {
      m.docker.listContainers.mockRejectedValueOnce(new Error("boom"));

      await expect(
        priv().getProcessingContainer({ processingId: "p1" }),
      ).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service/FAIL_TO_GET_CONTAINER",
        }),
      );
    });
  });

  describe("fetchDatasetFile", () => {
    it("should download the dataset file and return its path", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => ({
        data: makeProcessing().data,
      })) as never;
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      const result = await priv().fetchDatasetFile(processing);

      expect(m.axios.get).toHaveBeenCalled();
      expect(result).toContain("ds.csv");
    });

    it("should skip the unlink when the file does not exist yet", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => ({
        data: makeProcessing().data,
      })) as never;
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      await priv().fetchDatasetFile(processing);

      expect(m.fsPromises.unlink).not.toHaveBeenCalled();
    });

    it("should throw when the input directory is missing", async () => {
      const processing = makeProcessing();
      m.fsSync.existsSync.mockReturnValueOnce(false);

      await expect(priv().fetchDatasetFile(processing)).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/MISSING_DIRECTORY",
        }),
      );
    });

    it("should register warnings when the file has no public access data", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => ({
        data: makeProcessing({
          dataset: {
            file: {
              filename: "ds.csv",
              public_url: "http://file",
              public_url_expires_at: null,
              allow_public_access: false,
            },
          },
        }).data,
      })) as never;
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      await priv().fetchDatasetFile(processing);

      expect(workerErrorMake).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/NO_PUBLIC_ACCESS",
        }),
      );
      expect(workerErrorMake).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/NO_PUBLIC_ACCESS_DATA",
        }),
      );
    });

    it("should register a warning when the public access expired", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => ({
        data: makeProcessing().data,
      })) as never;
      m.now.mockReturnValue({ isAfter: vi.fn(() => true) });
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      await priv().fetchDatasetFile(processing);

      expect(workerErrorMake).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/EXPIRED_DATASET_FILE",
        }),
      );
    });

    it("should throw when the downloaded file is missing", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => ({
        data: makeProcessing().data,
      })) as never;
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false);

      await expect(priv().fetchDatasetFile(processing)).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/MISSING_FILE",
        }),
      );
    });

    it("should wrap generic errors raised while downloading", async () => {
      const processing = makeProcessing();
      context.api.client.get = vi.fn(async () => {
        throw new Error("net");
      }) as never;
      m.fsSync.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

      await expect(priv().fetchDatasetFile(processing)).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_fetch_dataset_file/FAIL_TO_DOWNLOAD",
        }),
      );
    });
  });

  describe("startProcessing", () => {
    it("should create and start the container using host binds", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "pullImage").mockResolvedValue(undefined);
      vi.spyOn(priv(), "fetchDatasetFile").mockResolvedValue("/path");
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});

      await priv().startProcessing("p1");

      expect(m.docker.createContainer).toHaveBeenCalled();
      expect(m.container.start).toHaveBeenCalled();
      expect(m.configMock.setConfigValue).toHaveBeenCalledWith(
        "container_id",
        "cid",
      );
    });

    it("should create the container using volume mounts in a container environment", async () => {
      m.getSystemEnvironment.mockReturnValue("container");
      m.docker.listVolumes.mockResolvedValue({
        Volumes: [{ Name: "autodroid_worker_data" }],
      });
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "pullImage").mockResolvedValue(undefined);
      vi.spyOn(priv(), "fetchDatasetFile").mockResolvedValue("/path");
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});

      await priv().startProcessing("p1");

      const options = m.docker.createContainer.mock.calls[0][0];
      expect(options.HostConfig).toEqual({
        Mounts: [
          {
            Type: "volume",
            Source: "autodroid_worker_data",
            Target: "/in",
            VolumeOptions: { Subpath: "vin" },
          },
          {
            Type: "volume",
            Source: "autodroid_worker_data",
            Target: "/out",
            VolumeOptions: { Subpath: "vout" },
          },
        ],
      });
    });

    it("should remove the container and fail when the start throws", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "pullImage").mockResolvedValue(undefined);
      vi.spyOn(priv(), "fetchDatasetFile").mockResolvedValue("/path");
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);
      m.container.start.mockRejectedValueOnce(new Error("start failed"));

      await priv().startProcessing("p1");

      expect(m.container.remove).toHaveBeenCalledWith({ force: true });
      expect(failure).toHaveBeenCalledWith({
        processingId: "p1",
        reason: "start failed",
      });
    });

    it("should handle failures raised before the container creation", async () => {
      vi.spyOn(priv(), "getProcessing").mockRejectedValue(
        new Error("no processing"),
      );
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);

      await priv().startProcessing("p1");

      expect(failure).toHaveBeenCalledWith({
        processingId: "p1",
        reason: "no processing",
      });
    });
  });

  describe("getProcessing", () => {
    const setValidGet = () => {
      context.api.client.get = vi.fn(async () => makeProcessing()) as never;
    };

    it("should build the processing payload with existing directories", async () => {
      setValidGet();
      m.configMock.getConfig.mockReturnValue({
        container_id: "existing",
        internal_status: "RUNNING",
      });

      const result = await priv().getProcessing("p1");

      expect(result.container_id).toBe("existing");
      expect(result.internal_status).toBe("RUNNING");
      expect(m.configMock.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          container_id: "existing",
          internal_status: "RUNNING",
          system_working_dir: "/base/system/p1",
          system_input_dir: "/base/system/p1/shared/inputs",
          system_output_dir: "/base/system/p1/shared/outputs",
          volume_working_dir: "base/folder/p1",
          volume_input_dir: "base/folder/p1/shared/inputs",
          volume_output_dir: "base/folder/p1/shared/outputs",
        }),
      );
    });

    it("should default the container id and status when they are absent", async () => {
      setValidGet();
      m.configMock.getConfig.mockReturnValue({});

      const result = await priv().getProcessing("p1");

      expect(result.container_id).toBeNull();
      expect(result.internal_status).toBe("PENDING");
    });

    it("should throw when the processing data is incomplete", async () => {
      context.api.client.get = vi.fn(async () => ({
        data: { id: null },
      })) as never;

      await expect(priv().getProcessing("p1")).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_get_processing/MISSING_PROCESSING_DATA",
        }),
      );
    });

    it("should create the input directory when it is missing", async () => {
      setValidGet();
      m.fsSync.existsSync
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      await priv().getProcessing("p1");

      expect(m.fsPromises.mkdir).toHaveBeenCalled();
    });

    it("should throw when the input directory cannot be created", async () => {
      setValidGet();
      m.fsSync.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false);

      await expect(priv().getProcessing("p1")).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_get_processing/MISSING_INPUT_DIRECTORY",
        }),
      );
    });

    it("should create the output directory when it is missing", async () => {
      setValidGet();
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      await priv().getProcessing("p1");

      expect(m.fsPromises.mkdir).toHaveBeenCalled();
    });

    it("should throw when the output directory cannot be created", async () => {
      setValidGet();
      m.fsSync.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false);

      await expect(priv().getProcessing("p1")).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_get_processing/MISSING_OUTPUT_DIRECTORY",
        }),
      );
    });
  });

  describe("getProcessingFromLocalStorage", () => {
    it("should return the stored configuration data", async () => {
      m.configMock.getConfig.mockReturnValue({ container_id: "stored" });

      const result = await priv().getProcessingFromLocalStorage("p1");

      expect(result.container_id).toBe("stored");
      expect(result.configuration).toBe(m.configMock);
    });
  });

  describe("cleanup", () => {
    it("should remove the working directory and container", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "updateProcessingFilePermissions").mockResolvedValue(
        undefined,
      );
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "checkDefaultVolume").mockResolvedValue(undefined);

      await priv().cleanup({ processingId: "p1" });

      expect(m.rimraf).toHaveBeenCalled();
      expect(m.container.remove).toHaveBeenCalledWith({ force: true });
    });

    it("should fall back to local storage when getting the processing fails", async () => {
      vi.spyOn(priv(), "getProcessing").mockRejectedValue(new Error("no api"));
      const fallback = vi
        .spyOn(priv(), "getProcessingFromLocalStorage")
        .mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "updateProcessingFilePermissions").mockResolvedValue(
        undefined,
      );
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(null);
      vi.spyOn(priv(), "checkDefaultVolume").mockResolvedValue(undefined);

      await priv().cleanup({ processingId: "p1" });

      expect(fallback).toHaveBeenCalledWith("p1");
    });

    it("should skip the directory removal when it does not exist", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(null);
      vi.spyOn(priv(), "checkDefaultVolume").mockResolvedValue(undefined);
      m.fsSync.existsSync.mockReturnValue(false);

      await priv().cleanup({ processingId: "p1" });

      expect(m.rimraf).not.toHaveBeenCalled();
    });

    it("should register an error when the processing id is not set", async () => {
      await priv().cleanup({ processingId: "" });

      expect(m.logger.error).toHaveBeenCalled();
    });

    it("should register an error when the cleanup throws", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      vi.spyOn(priv(), "updateProcessingFilePermissions").mockResolvedValue(
        undefined,
      );
      vi.spyOn(priv(), "getProcessingContainer").mockRejectedValue(
        new Error("boom"),
      );

      await priv().cleanup({ processingId: "p1" });

      expect(m.logger.error).toHaveBeenCalled();
    });
  });

  describe("getLatestLogsFromContainer", () => {
    it("should return an empty string when there is no container", async () => {
      await expect(
        priv().getLatestLogsFromContainer({ container: null, tail: 10 }),
      ).resolves.toBe("");
    });

    it("should return the container logs", async () => {
      await expect(
        priv().getLatestLogsFromContainer({ container: m.container, tail: 10 }),
      ).resolves.toBe("logs");
    });

    it("should return an empty string when getting the logs fails", async () => {
      m.container.logs.mockRejectedValueOnce(new Error("no logs"));

      await expect(
        priv().getLatestLogsFromContainer({ container: m.container, tail: 10 }),
      ).resolves.toBe("");
    });
  });

  describe("getAllLogsFromContainer", () => {
    it("should return an empty string when there is no container", async () => {
      await expect(
        priv().getAllLogsFromContainer({ container: null }),
      ).resolves.toBe("");
    });

    it("should return the full container logs", async () => {
      await expect(
        priv().getAllLogsFromContainer({ container: m.container }),
      ).resolves.toBe("logs");
    });

    it("should return an empty string when getting the full logs fails", async () => {
      m.container.logs.mockRejectedValueOnce(new Error("no logs"));

      await expect(
        priv().getAllLogsFromContainer({ container: m.container }),
      ).resolves.toBe("");
    });
  });

  describe("getMatchedFilesByGlobPatterns", () => {
    it("should resolve the glob patterns relative to the container directory", async () => {
      m.glob.mockResolvedValueOnce(["/out/a.txt"]);

      const result = await priv().getMatchedFilesByGlobPatterns({
        containerDir: "/out",
        globPatterns: ["*.txt"],
      });

      expect(result).toEqual(["/out/a.txt"]);
      expect(m.glob).toHaveBeenCalledWith(["/out/*.txt"]);
    });
  });

  describe("updateProcessingFilePermissions", () => {
    it("should skip permission fixing in a container environment", async () => {
      m.getSystemEnvironment.mockReturnValue("container");

      await priv().updateProcessingFilePermissions(makeProcessing());

      expect(m.docker.createContainer).not.toHaveBeenCalled();
    });

    it("should run the busybox cleaner when the image already exists", async () => {
      vi.spyOn(priv(), "imageExists").mockResolvedValue(true);
      const pull = vi.spyOn(priv(), "pullImage").mockResolvedValue(undefined);

      await priv().updateProcessingFilePermissions(makeProcessing());

      expect(pull).not.toHaveBeenCalled();
      expect(m.container.start).toHaveBeenCalled();
      expect(m.container.wait).toHaveBeenCalled();
      expect(m.container.remove).toHaveBeenCalled();
    });

    it("should pull busybox when it is missing", async () => {
      vi.spyOn(priv(), "imageExists").mockResolvedValue(false);
      const pull = vi.spyOn(priv(), "pullImage").mockResolvedValue(undefined);

      await priv().updateProcessingFilePermissions(makeProcessing());

      expect(pull).toHaveBeenCalledWith("busybox:latest");
    });
  });

  describe("processExecution", () => {
    const spyCommon = () => {
      vi.spyOn(priv(), "updateProcessingFilePermissions").mockResolvedValue(
        undefined,
      );
    };

    it("should handle success when the container is gone and status succeeded", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(
        makeProcessing({ status: "SUCCEEDED" }),
      );
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(null);
      const success = vi
        .spyOn(priv(), "handleSuccess")
        .mockResolvedValue(undefined);

      await priv().processExecution("p1");

      expect(success).toHaveBeenCalledWith({ processingId: "p1" });
    });

    it("should fail when the container is missing and status is not succeeded", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(null);
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);

      await priv().processExecution("p1");

      expect(failure).toHaveBeenCalledWith({
        processingId: "p1",
        reason: "Unable to find container autodroid_worker_worker_p1.",
      });
    });

    it("should report progress while the container is running", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      m.container.inspect.mockResolvedValueOnce({ State: { Running: true } });

      await priv().processExecution("p1");

      expect(context.api.client.post).toHaveBeenCalledWith(
        "/worker/processing/p1/progress",
      );
    });

    it("should zip, upload and succeed when the container exited with zero", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "getAllLogsFromContainer").mockResolvedValue(
        "some logs",
      );
      const zip = vi.spyOn(priv(), "zipAndUpload").mockResolvedValue(undefined);
      const success = vi
        .spyOn(priv(), "handleSuccess")
        .mockResolvedValue(undefined);
      m.container.inspect.mockResolvedValueOnce({
        State: { Running: false, ExitCode: 0 },
      });

      await priv().processExecution("p1");

      expect(m.fsPromises.writeFile).toHaveBeenCalled();
      expect(zip).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("should fail when the container exited with a non-zero code", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "getAllLogsFromContainer").mockResolvedValue("");
      vi.spyOn(priv(), "zipAndUpload").mockResolvedValue(undefined);
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);
      m.container.inspect.mockResolvedValueOnce({
        State: { Running: false, ExitCode: 1 },
      });

      await priv().processExecution("p1");

      expect(m.fsPromises.writeFile).not.toHaveBeenCalled();
      expect(failure).toHaveBeenCalledWith({
        processingId: "p1",
        reason: "Container exited with code 1.",
      });
    });

    it("should fail when the output directory has no files", async () => {
      vi.spyOn(priv(), "getProcessing").mockResolvedValue(makeProcessing());
      spyCommon();
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "getAllLogsFromContainer").mockResolvedValue("");
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);
      m.container.inspect.mockResolvedValueOnce({
        State: { Running: false, ExitCode: 0 },
      });
      m.fsPromises.readdir.mockResolvedValueOnce([]);

      await priv().processExecution("p1");

      expect(failure).toHaveBeenCalled();
    });

    it("should fail when an unexpected error is raised", async () => {
      vi.spyOn(priv(), "getProcessing").mockRejectedValue(new Error("boom"));
      const failure = vi
        .spyOn(priv(), "handleFailure")
        .mockResolvedValue(undefined);

      await priv().processExecution("p1");

      expect(failure).toHaveBeenCalledWith({
        processingId: "p1",
        reason: "boom",
      });
    });
  });

  describe("zipDirectory", () => {
    it("should resolve with the zipped file metadata", async () => {
      const result = await priv().zipDirectory({
        containerDir: "/out",
        files: ["/out/a.txt"],
        zipDestinationFilePath: "/out/result.zip",
      });

      expect(result).toEqual({
        size: 999,
        md5_hash: "md5hash",
        filename: "result.zip",
        mime_type: "application/zip",
      });
    });

    it("should feed the archived bytes into the md5 hash", async () => {
      await priv().zipDirectory({
        containerDir: "/out",
        files: ["/out/a.txt"],
        zipDestinationFilePath: "/out/result.zip",
      });

      expect(hashUpdate).toHaveBeenCalledWith(Buffer.from("x"));
    });

    it("should reject when the archive fails", async () => {
      state.archiverError = true;

      await expect(
        priv().zipDirectory({
          containerDir: "/out",
          files: ["/out/a.txt"],
          zipDestinationFilePath: "/out/result.zip",
        }),
      ).rejects.toThrow("zip fail");
    });
  });

  describe("getUploadUrl", () => {
    it("should reuse the existing upload url when present", async () => {
      const processing = makeProcessing({
        result_file: { upload_url: "http://existing" },
      });

      const result = await priv().getUploadUrl({
        processing,
        kind: "result_file",
        fileData: {},
      });

      expect(result).toBe("http://existing");
      expect(context.api.client.post).not.toHaveBeenCalled();
    });

    it("should reuse the existing metrics upload url when present", async () => {
      const processing = makeProcessing({
        metrics_file: { upload_url: "http://existing-metrics" },
      });

      const result = await priv().getUploadUrl({
        processing,
        kind: "metrics_file",
        fileData: {},
      });

      expect(result).toBe("http://existing-metrics");
      expect(context.api.client.post).not.toHaveBeenCalled();
    });

    it("should request a new upload url when none exists", async () => {
      context.api.client.post = vi.fn(async () => ({
        data: { upload_url: "http://new" },
      })) as never;

      const result = await priv().getUploadUrl({
        processing: makeProcessing(),
        kind: "metrics_file",
        fileData: {},
      });

      expect(result).toBe("http://new");
    });

    it("should fail when the generated upload url is missing", async () => {
      context.api.client.post = vi.fn(async () => ({ data: {} })) as never;

      await expect(
        priv().getUploadUrl({
          processing: makeProcessing(),
          kind: "result_file",
          fileData: {},
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_get_upload_url/FAIL_TO_GET_UPLOAD_URL",
        }),
      );
    });

    it("should fail when the upload url request throws", async () => {
      context.api.client.post = vi.fn(async () => {
        throw new Error("net");
      }) as never;

      await expect(
        priv().getUploadUrl({
          processing: makeProcessing(),
          kind: "result_file",
          fileData: {},
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_get_upload_url/FAIL_TO_GET_UPLOAD_URL",
        }),
      );
    });
  });

  describe("zipAndUpload", () => {
    it("should upload both result and metrics files", async () => {
      vi.spyOn(priv(), "getMatchedFilesByGlobPatterns")
        .mockResolvedValueOnce(["/out/a.txt"])
        .mockResolvedValueOnce(["/out/b.json"]);
      vi.spyOn(priv(), "zipDirectory").mockResolvedValue({
        filename: "f.zip",
        md5_hash: "h",
        size: 1,
        mime_type: "application/zip",
      });
      vi.spyOn(priv(), "getUploadUrl").mockResolvedValue("http://upload");

      await priv().zipAndUpload(makeProcessing());

      expect(m.axios.put).toHaveBeenCalledTimes(2);
    });

    it("should skip uploads that have no matching files", async () => {
      vi.spyOn(priv(), "getMatchedFilesByGlobPatterns")
        .mockResolvedValueOnce(["/out/a.txt"])
        .mockResolvedValueOnce([]);
      vi.spyOn(priv(), "zipDirectory").mockResolvedValue({
        filename: "f.zip",
        md5_hash: "h",
        size: 1,
        mime_type: "application/zip",
      });
      vi.spyOn(priv(), "getUploadUrl").mockResolvedValue("http://upload");

      await priv().zipAndUpload(makeProcessing());

      expect(m.axios.put).toHaveBeenCalledTimes(1);
      expect(m.logger.warn).toHaveBeenCalled();
    });

    it("should skip result but upload metrics when only metrics match", async () => {
      vi.spyOn(priv(), "getMatchedFilesByGlobPatterns")
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(["/out/b.json"]);
      vi.spyOn(priv(), "zipDirectory").mockResolvedValue({
        filename: "f.zip",
        md5_hash: "h",
        size: 1,
        mime_type: "application/zip",
      });
      vi.spyOn(priv(), "getUploadUrl").mockResolvedValue("http://upload");

      await priv().zipAndUpload(makeProcessing());

      expect(m.axios.put).toHaveBeenCalledTimes(1);
      expect(m.logger.warn).toHaveBeenCalled();
    });

    it("should fail when no files match any pattern", async () => {
      vi.spyOn(priv(), "getMatchedFilesByGlobPatterns").mockResolvedValue([]);

      await expect(priv().zipAndUpload(makeProcessing())).rejects.toEqual(
        expect.objectContaining({
          key: "@processing_service_zip_and_upload/FAIL_TO_UPLOAD",
        }),
      );
    });
  });

  describe("handleSuccess", () => {
    it("should return early when there is no processing id", async () => {
      await priv().handleSuccess({ processingId: "" });

      expect(context.api.client.post).not.toHaveBeenCalled();
    });

    it("should report success and clean up", async () => {
      const cleanup = vi.spyOn(priv(), "cleanup").mockResolvedValue(undefined);

      await priv().handleSuccess({ processingId: "p1" });

      expect(context.api.client.post).toHaveBeenCalledWith(
        "/worker/processing/p1/success",
      );
      expect(cleanup).toHaveBeenCalled();
    });

    it("should register an error when handling the success fails", async () => {
      vi.spyOn(priv(), "cleanup").mockResolvedValue(undefined);
      context.api.client.post = vi.fn(async () => {
        throw new Error("net");
      }) as never;

      await priv().handleSuccess({ processingId: "p1" });

      expect(m.logger.error).toHaveBeenCalled();
    });
  });

  describe("handleFailure", () => {
    it("should return early when there is no processing id", async () => {
      await priv().handleFailure({ processingId: "", reason: "x" });

      expect(context.api.client.post).not.toHaveBeenCalled();
    });

    it("should log the container logs and report the failure", async () => {
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "getLatestLogsFromContainer").mockResolvedValue("logs");
      vi.spyOn(priv(), "cleanup").mockResolvedValue(undefined);

      await priv().handleFailure({ processingId: "p1", reason: "why" });

      expect(context.api.client.post).toHaveBeenCalledWith(
        "/worker/processing/p1/failure",
        { reason: "why" },
      );
    });

    it("should report a null reason and warn when there is no container", async () => {
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(null);
      vi.spyOn(priv(), "cleanup").mockResolvedValue(undefined);

      await priv().handleFailure({ processingId: "p1", reason: null });

      expect(context.api.client.post).toHaveBeenCalledWith(
        "/worker/processing/p1/failure",
        { reason: null },
      );
      expect(m.logger.error).toHaveBeenCalled();
    });

    it("should skip logging when there are no container logs", async () => {
      vi.spyOn(priv(), "getProcessingContainer").mockResolvedValue(m.container);
      vi.spyOn(priv(), "getLatestLogsFromContainer").mockResolvedValue("");
      vi.spyOn(priv(), "cleanup").mockResolvedValue(undefined);

      await priv().handleFailure({ processingId: "p1", reason: "why" });

      expect(m.logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("Latest logs from container"),
      );
      expect(context.api.client.post).toHaveBeenCalledWith(
        "/worker/processing/p1/failure",
        { reason: "why" },
      );
    });

    it("should register an error when handling the failure throws", async () => {
      vi.spyOn(priv(), "getProcessingContainer").mockRejectedValue(
        new Error("boom"),
      );

      await priv().handleFailure({ processingId: "p1", reason: "why" });

      expect(m.logger.error).toHaveBeenCalled();
    });
  });

  describe("startProcessingInterval", () => {
    it("should schedule the process on the configured delay", async () => {
      const process = vi.spyOn(priv(), "process").mockResolvedValue(undefined);

      priv().startProcessingInterval();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5000);

      expect(process).toHaveBeenCalled();
    });

    it("should clear a pending timeout before scheduling a new one", async () => {
      const process = vi.spyOn(priv(), "process").mockResolvedValue(undefined);
      const pendingTimeout = setTimeout(() => {}, 1000);
      priv().processTimeout = pendingTimeout;

      priv().startProcessingInterval();
      await Promise.resolve();

      expect(priv().processTimeout).not.toBe(pendingTimeout);

      await vi.advanceTimersByTimeAsync(5000);

      expect(process).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCurrentProcessingIds", () => {
    it("should return only the directory entries", async () => {
      m.fsPromises.readdir.mockResolvedValueOnce(["a", "b"]);
      m.fsSync.lstatSync
        .mockReturnValueOnce({ isDirectory: () => true })
        .mockReturnValueOnce({ isDirectory: () => false });

      const result = await priv().getCurrentProcessingIds();

      expect(result).toEqual(["a"]);
    });

    it("should return an empty list when the directory cannot be read", async () => {
      m.fsPromises.readdir.mockRejectedValueOnce(new Error("no dir"));

      await expect(priv().getCurrentProcessingIds()).resolves.toEqual([]);
    });
  });

  describe("reportStatus", () => {
    it("should log and emit the work status for new processing", async () => {
      priv().status = null;

      await priv().reportStatus(["1"]);

      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processing 1 items"),
      );
      expect(context.webSocketClient.socket.emit).toHaveBeenCalledWith(
        "worker:status",
        expect.objectContaining({ status: "WORK" }),
      );
    });

    it("should not re-log the work status when it is unchanged", async () => {
      priv().status = "WORK";
      priv().processCount = 1;

      await priv().reportStatus(["1"]);

      expect(m.logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("Processing"),
      );
    });

    it("should log again when the process count changes", async () => {
      priv().status = "WORK";
      priv().processCount = 2;

      await priv().reportStatus(["1"]);

      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Processing 1 items"),
      );
    });

    it("should log and emit the idle status when there are no items", async () => {
      priv().status = "WORK";

      await priv().reportStatus([]);

      expect(m.logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Waiting for items"),
      );
      expect(context.webSocketClient.socket.emit).toHaveBeenCalledWith(
        "worker:status",
        expect.objectContaining({ status: "IDLE" }),
      );
    });

    it("should not re-log the idle status when it is unchanged", async () => {
      priv().status = "IDLE";

      await priv().reportStatus([]);

      expect(m.logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("Waiting"),
      );
    });

    it("should emit an unknown name when the worker name is empty", async () => {
      context.authentication.getConfig = vi.fn(() => ({
        name: "",
        worker_id: "wid",
      })) as never;

      await priv().reportStatus([]);

      expect(context.webSocketClient.socket.emit).toHaveBeenCalledWith(
        "worker:status",
        expect.objectContaining({ name: "Unknown" }),
      );
    });
  });

  describe("process", () => {
    it("should report status and execute pending processing when connected", async () => {
      vi.spyOn(priv(), "getCurrentProcessingIds").mockResolvedValue(["1"]);
      vi.spyOn(priv(), "reportStatus").mockResolvedValue(undefined);
      const exec = vi
        .spyOn(priv(), "processExecution")
        .mockResolvedValue(undefined);
      vi.spyOn(priv(), "cleanupOldCleanerContainers").mockResolvedValue(
        undefined,
      );
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});

      await priv().process();

      expect(exec).toHaveBeenCalledWith("1");
    });

    it("should skip processing when disconnected", async () => {
      context.webSocketClient.getIsConnected = vi.fn(() => false) as never;
      const ids = vi.spyOn(priv(), "getCurrentProcessingIds");
      vi.spyOn(priv(), "cleanupOldCleanerContainers").mockResolvedValue(
        undefined,
      );
      vi.spyOn(priv(), "startProcessingInterval").mockImplementation(() => {});

      await priv().process();

      expect(ids).not.toHaveBeenCalled();
    });

    it("should register an error when processing throws", async () => {
      vi.spyOn(priv(), "getCurrentProcessingIds").mockRejectedValue(
        new Error("boom"),
      );
      const interval = vi
        .spyOn(priv(), "startProcessingInterval")
        .mockImplementation(() => {});

      await priv().process();

      expect(m.logger.error).toHaveBeenCalled();
      expect(interval).toHaveBeenCalled();
    });
  });
});
