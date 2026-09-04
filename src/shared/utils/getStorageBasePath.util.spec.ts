import path from "node:path";
import os from "node:os";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { getSystemEnvironment } from "./getSystemEnvironment.util";

// Test target import
import {
  getStorageBaseFolder,
  getStorageBasePath,
} from "./getStorageBasePath.util";

vi.mock("@config/env", () => ({ getEnvConfig: vi.fn(() => ({})) }));
vi.mock("./getSystemEnvironment.util", () => ({
  getSystemEnvironment: vi.fn(),
}));

const setEnvironment = (environment: string) =>
  (getSystemEnvironment as Mock).mockReturnValue(environment);

describe("Utils: getStorageBasePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getEnvConfig as Mock).mockReturnValue({ APP_INFO: { name: "app" } });
    process.env.NAME = "worker";
  });

  it("should build the storage base folder from the app info and worker name", () => {
    expect(getStorageBaseFolder("dir")).toBe(path.join("app-worker", "dir"));
  });

  it("should resolve the test path under cwd/temp/test", () => {
    setEnvironment("test");

    expect(getStorageBasePath("dir")).toBe(
      path.join(process.cwd(), "temp", "test", "app-worker", "dir"),
    );
  });

  it("should resolve the development path under cwd/temp", () => {
    setEnvironment("development");

    expect(getStorageBasePath("dir")).toBe(
      path.join(process.cwd(), "temp", "app-worker", "dir"),
    );
  });

  it("should resolve the container path under cwd/temp", () => {
    setEnvironment("container");

    expect(getStorageBasePath("dir")).toBe(
      path.join(process.cwd(), "temp", "app-worker", "dir"),
    );
  });

  it("should resolve the linux path under the config home", () => {
    setEnvironment("linux");

    expect(getStorageBasePath("dir")).toBe(
      path.join(os.homedir(), ".config", "app-worker", "dir"),
    );
  });

  it("should resolve the windows path under APPDATA", () => {
    setEnvironment("windows");
    process.env.APPDATA = "C:/AppData";

    expect(getStorageBasePath("dir")).toBe(
      path.join("C:/AppData", "app-worker", "dir"),
    );
  });

  it("should resolve the windows path with an empty base when APPDATA is missing", () => {
    setEnvironment("windows");
    delete process.env.APPDATA;

    expect(getStorageBasePath("dir")).toBe(path.join("", "app-worker", "dir"));
  });

  it("should resolve the macos path under Application Support", () => {
    setEnvironment("macos");

    expect(getStorageBasePath("dir")).toBe(
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "app-worker",
        "dir",
      ),
    );
  });

  it("should throw on an unknown environment", () => {
    setEnvironment("solaris");

    let error: unknown;
    try {
      getStorageBasePath("dir");
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toEqual(
      expect.objectContaining({
        key: "@get_storage_bash_path/UNKNOWN_PLATFORM",
      }),
    );
  });
});
