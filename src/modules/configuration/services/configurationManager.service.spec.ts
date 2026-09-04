import fsSync from "node:fs";
import fsPromises from "node:fs/promises";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Util import
import { sleep } from "@shared/utils/sleep.util";
import { logger } from "@shared/utils/logger";

// Config import
import { defaultConfiguration } from "../constants/defaultConfiguration";

// Enum import
import { CONFIGURATION } from "../types/configuration.enum";

// Test target import
import { ConfigurationManagerService } from "./configurationManager.service";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));
vi.mock("node:fs/promises", () => ({
  default: { mkdir: vi.fn(), writeFile: vi.fn() },
}));
vi.mock("@shared/utils/getStorageBasePath.util", () => ({
  getStorageBasePath: vi.fn((filename: string) => `/base/${filename}`),
}));
vi.mock("@shared/utils/sleep.util", () => ({ sleep: vi.fn() }));
vi.mock("@shared/utils/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const existsSync = fsSync.existsSync as Mock;
const readFileSync = fsSync.readFileSync as Mock;

const build = (key: string, initial: Record<string, unknown> = {}) => {
  existsSync.mockReturnValue(true);
  readFileSync.mockReturnValue(JSON.stringify(initial));
  return new ConfigurationManagerService(key);
};

describe("Service: ConfigurationManagerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sleep as Mock).mockResolvedValue(undefined);
  });

  it("should load an existing config and merge the defaults for a known key", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ name: "worker", extra: "x" }),
    );

    const service = new ConfigurationManagerService(
      CONFIGURATION.AUTHENTICATION,
    );

    expect(service.getConfig().name).toBe("worker");
    expect(service.getConfig().registration_token).toBeNull();
    expect(
      (service.getConfig() as Record<string, unknown>).extra,
    ).toBeUndefined();
  });

  it("should normalize nullish sentinel values for a key without defaults", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ b: "undefined", d: "null", e: "keep", f: null }),
    );

    const service = new ConfigurationManagerService("CUSTOM");

    expect(service.getConfig()).toEqual({
      b: null,
      d: null,
      e: "keep",
      f: null,
    });
  });

  it("should warn and create the file with defaults for a known missing key", () => {
    existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false);
    readFileSync.mockReturnValue(
      JSON.stringify(defaultConfiguration[CONFIGURATION.AUTHENTICATION]),
    );

    // eslint-disable-next-line no-new -- constructed for its file-creation side effect, the instance itself is never used
    new ConfigurationManagerService(CONFIGURATION.AUTHENTICATION);

    expect(logger.warn).toHaveBeenCalledWith(
      "Config file not found, creating a new one at /base/AUTHENTICATION.json",
    );
    expect(fsSync.mkdirSync).toHaveBeenCalledWith("/base", { recursive: true });
    expect(fsSync.writeFileSync).toHaveBeenCalledWith(
      "/base/AUTHENTICATION.json",
      JSON.stringify(
        defaultConfiguration[CONFIGURATION.AUTHENTICATION],
        null,
        2,
      ),
    );
  });

  it("should not warn nor create the directory for an unknown missing key when the directory exists", () => {
    existsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    readFileSync.mockReturnValue(JSON.stringify({}));

    // eslint-disable-next-line no-new -- constructed for its file-creation side effect, the instance itself is never used
    new ConfigurationManagerService("CUSTOM");

    expect(logger.warn).not.toHaveBeenCalled();
    expect(fsSync.mkdirSync).not.toHaveBeenCalled();
    expect(fsSync.writeFileSync).toHaveBeenCalledWith(
      "/base/CUSTOM.json",
      "{}",
    );
  });

  it("should throw when the config file cannot be read", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockImplementation(() => {
      throw new Error("bad file");
    });

    let error: unknown;
    try {
      // eslint-disable-next-line no-new -- constructed for its file-read side effect, the instance itself is never used
      new ConfigurationManagerService("CUSTOM");
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toEqual(
      expect.objectContaining({
        key: "@configuration_manager_service_load_config/CONFIG_FILE_READ_ERROR",
      }),
    );
  });

  it("should merge and persist values with setConfig without creating an existing directory", async () => {
    const service = build("CUSTOM", { a: 1 });
    existsSync.mockReturnValue(true);

    await service.setConfig({ b: 2, c: undefined });

    expect(service.getConfig()).toEqual({ a: 1, b: 2, c: null });
    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      "/base/CUSTOM.json",
      JSON.stringify({ a: 1, b: 2, c: null }, null, 2),
    );
    expect(fsPromises.mkdir).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("should create the directory when persisting a single value", async () => {
    const service = build("CUSTOM", {});
    existsSync.mockReturnValue(false);

    await service.setConfigValue("x", "value");

    expect(fsPromises.mkdir).toHaveBeenCalledWith("/base", { recursive: true });
    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      "/base/CUSTOM.json",
      JSON.stringify({ x: "value" }, null, 2),
    );
    expect(service.getConfigValue("x")).toBe("value");
  });

  it("should delete and recreate the config on reset", () => {
    const service = build(
      CONFIGURATION.AUTHENTICATION,
      defaultConfiguration[CONFIGURATION.AUTHENTICATION],
    );
    existsSync.mockReturnValue(true);

    service.resetConfig();

    expect(fsSync.unlinkSync).toHaveBeenCalledWith("/base/AUTHENTICATION.json");
    expect(fsSync.writeFileSync).toHaveBeenCalledWith(
      "/base/AUTHENTICATION.json",
      JSON.stringify(
        defaultConfiguration[CONFIGURATION.AUTHENTICATION],
        null,
        2,
      ),
    );
  });

  it("should throw when the config file cannot be deleted", () => {
    const service = build("CUSTOM", {});
    (fsSync.unlinkSync as Mock).mockImplementation(() => {
      throw new Error("locked");
    });

    let error: unknown;
    try {
      service.deleteConfig();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toEqual(
      expect.objectContaining({
        key: "@configuration_manager_service_reset_config_file/CONFIG_FILE_DELETE_ERROR",
      }),
    );
  });
});
