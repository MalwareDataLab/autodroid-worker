import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Util import
import { logger } from "@shared/utils/logger";

const mocks = vi.hoisted(() => ({
  workerInstance: {},
  Worker: vi.fn(),
}));

vi.mock("@shared/utils/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./shared/infrastructure/worker", () => ({ Worker: mocks.Worker }));

const setEnv = (key: string, value: string) =>
  Reflect.set(process.env, key, value);

const unsetEnv = (key: string) => Reflect.deleteProperty(process.env, key);

const readEnv = (key: string): unknown => Reflect.get(process.env, key);

const loadEntrypoint = async (args: string[]) => {
  process.argv = ["node", "autodroid-worker", ...args];
  vi.resetModules();
  return import("./index");
};

describe("Entrypoint", () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    unsetEnv("REGISTRATION_TOKEN");
    unsetEnv("NAME");
    unsetEnv("DEBUG");
    unsetEnv("API_BASE_URL");
    setEnv("NODE_ENV", "production");
    mocks.Worker.mockImplementation(() => mocks.workerInstance);
    vi.spyOn(process, "exit").mockImplementation(code => {
      throw new Error(`process.exit:${code}`);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("should build the configuration from the process environment", async () => {
    setEnv("NAME", "env-worker");
    setEnv("REGISTRATION_TOKEN", "env-token");

    const entrypoint = await loadEntrypoint([]);

    expect(readEnv("NAME")).toBe("env-worker");
    expect(readEnv("REGISTRATION_TOKEN")).toBe("env-token");
    expect(readEnv("NODE_ENV")).toBe("production");
    expect(readEnv("DEBUG")).toBe("false");
    expect(readEnv("API_BASE_URL")).toBe("https://mdl-api.unihacker.club");
    expect(mocks.Worker).toHaveBeenCalledWith({
      name: "env-worker",
      registration_token: "env-token",
    });
    expect(entrypoint.worker).toBe(mocks.workerInstance);
  });

  it("should let the command line arguments override the environment", async () => {
    setEnv("NAME", "env-worker");
    setEnv("REGISTRATION_TOKEN", "env-token");
    setEnv("DEBUG", "false");
    setEnv("API_BASE_URL", "http://env-api");

    await loadEntrypoint([
      "--token",
      "cli-token",
      "--name",
      "cli-worker",
      "--env",
      "development",
      "--debug",
      "--url",
      "http://cli-api",
    ]);

    expect(readEnv("NODE_ENV")).toBe("development");
    expect(readEnv("DEBUG")).toBe("true");
    expect(readEnv("API_BASE_URL")).toBe("http://cli-api");
    expect(mocks.Worker).toHaveBeenCalledWith({
      name: "cli-worker",
      registration_token: "cli-token",
    });
  });

  it("should default the environment to production when none is provided", async () => {
    unsetEnv("NODE_ENV");
    setEnv("NAME", "env-worker");

    await loadEntrypoint([]);

    expect(readEnv("NODE_ENV")).toBe("production");
  });

  it("should read the debug flag and the api url from the environment", async () => {
    setEnv("NAME", "env-worker");
    setEnv("DEBUG", "true");
    setEnv("API_BASE_URL", "http://env-api");

    await loadEntrypoint([]);

    expect(readEnv("DEBUG")).toBe("true");
    expect(readEnv("API_BASE_URL")).toBe("http://env-api");
  });

  it("should keep debug disabled when the environment holds a non boolean value", async () => {
    setEnv("NAME", "env-worker");
    setEnv("DEBUG", "yes");

    await loadEntrypoint([]);

    expect(readEnv("DEBUG")).toBe("false");
  });

  it("should inject the --set pairs and ignore the malformed ones", async () => {
    setEnv("NAME", "env-worker");

    await loadEntrypoint([
      "--set",
      "CUSTOM_KEY=custom-value",
      "--set",
      "MISSING_VALUE",
      "--set",
      "=missing-key",
    ]);

    expect(readEnv("CUSTOM_KEY")).toBe("custom-value");
    expect(readEnv("MISSING_VALUE")).toBeUndefined();
    expect(readEnv("")).toBeUndefined();
  });

  it("should not export an undefined registration token to the environment", async () => {
    setEnv("NAME", "env-worker");

    await loadEntrypoint([]);

    expect(readEnv("REGISTRATION_TOKEN")).toBeUndefined();
    expect(mocks.Worker).toHaveBeenCalledWith({
      name: "env-worker",
      registration_token: undefined,
    });
  });

  it("should log the invalid fields and exit when the configuration is invalid", async () => {
    unsetEnv("NAME");

    await expect(loadEntrypoint([])).rejects.toThrow("process.exit:1");

    expect(logger.error).toHaveBeenCalledWith("❌ Invalid configuration: NAME");
    expect(mocks.Worker).not.toHaveBeenCalled();
  });

  it("should reject NODE_ENV=test at startup, the guard that keeps getStorageBasePath's test-path case unreachable outside a real test run", async () => {
    setEnv("NAME", "env-worker");
    setEnv("NODE_ENV", "test");

    await expect(loadEntrypoint([])).rejects.toThrow("process.exit:1");

    expect(logger.error).toHaveBeenCalledWith(
      "❌ Invalid configuration: NODE_ENV",
    );
    expect(mocks.Worker).not.toHaveBeenCalled();
  });

  it("should report every invalid field at once", async () => {
    unsetEnv("NAME");

    await expect(loadEntrypoint(["--url", "not-a-url"])).rejects.toThrow(
      "process.exit:1",
    );

    expect(logger.error).toHaveBeenCalledWith(
      "❌ Invalid configuration: NAME, API_BASE_URL",
    );
  });
});
