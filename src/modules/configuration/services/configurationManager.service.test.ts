import fsSync from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Util import
import { getStorageBasePath } from "@shared/utils/getStorageBasePath.util";

// Enum import
import { CONFIGURATION } from "../types/configuration.enum";

// Config import
import { defaultConfiguration } from "../constants/defaultConfiguration";

// Target import
import { ConfigurationManagerService } from "./configurationManager.service";

const configFilePath = (key: string) => getStorageBasePath(`${key}.json`);

const removeConfigFile = (key: string) => {
  const filePath = configFilePath(key);
  if (fsSync.existsSync(filePath)) fsSync.unlinkSync(filePath);
};

describe("Integration: ConfigurationManagerService against the real filesystem", () => {
  const usedKeys = new Set<string>();

  const trackedKey = (key: string) => {
    usedKeys.add(key);
    return key;
  };

  afterEach(() => {
    usedKeys.forEach(removeConfigFile);
    usedKeys.clear();
  });

  it("should create the config file with the default configuration on first load", () => {
    const key = trackedKey(CONFIGURATION.AUTHENTICATION);
    const filePath = configFilePath(key);

    expect(fsSync.existsSync(filePath)).toBe(false);

    const service = new ConfigurationManagerService(key);

    expect(fsSync.existsSync(filePath)).toBe(true);
    expect(service.getConfig()).toEqual(
      defaultConfiguration[CONFIGURATION.AUTHENTICATION],
    );

    const persisted = JSON.parse(fsSync.readFileSync(filePath, "utf-8"));
    expect(persisted).toEqual(defaultConfiguration[CONFIGURATION.AUTHENTICATION]);
  });

  it("should load an already-persisted config file instead of overwriting it", () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_load_${Date.now()}`);
    const filePath = configFilePath(key);
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, JSON.stringify({ custom: "value" }));

    const service = new ConfigurationManagerService(key);

    expect(service.getConfig()).toEqual({ custom: "value" });
  });

  it("should round trip setConfigValue through a real read after write", async () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_set_value_${Date.now()}`);
    const service = new ConfigurationManagerService(key);

    await service.setConfigValue("token" as never, "abc123" as never);

    expect(service.getConfigValue("token" as never)).toBe("abc123");

    const persisted = JSON.parse(
      fsSync.readFileSync(configFilePath(key), "utf-8"),
    );
    expect(persisted.token).toBe("abc123");

    const reloaded = new ConfigurationManagerService(key);
    expect(reloaded.getConfigValue("token" as never)).toBe("abc123");
  });

  it("should round trip setConfig (merge) through a real read after write", async () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_set_config_${Date.now()}`);
    const service = new ConfigurationManagerService(key);

    await service.setConfig({ a: 1, b: 2 } as never);
    await service.setConfig({ b: 3 } as never);

    expect(service.getConfig()).toEqual({ a: 1, b: 3 });

    const persisted = JSON.parse(
      fsSync.readFileSync(configFilePath(key), "utf-8"),
    );
    expect(persisted).toEqual({ a: 1, b: 3 });
  });

  it("should sanitize undefined/null-like string values to real null on write", async () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_sanitize_${Date.now()}`);
    const service = new ConfigurationManagerService(key);

    await service.setConfig({
      a: "undefined",
      b: "null",
      c: undefined,
      d: null,
      e: "kept",
    } as never);

    const persisted = JSON.parse(
      fsSync.readFileSync(configFilePath(key), "utf-8"),
    );
    expect(persisted).toEqual({ a: null, b: null, c: null, d: null, e: "kept" });
  });

  it("should fill missing keys with the module's real default configuration on write", async () => {
    const key = trackedKey(CONFIGURATION.AUTHENTICATION);
    const service = new ConfigurationManagerService(key);

    await service.setConfigValue("name" as never, "worker-x" as never);

    const persisted = JSON.parse(fsSync.readFileSync(configFilePath(key), "utf-8"));
    expect(persisted).toEqual({
      ...defaultConfiguration[CONFIGURATION.AUTHENTICATION],
      name: "worker-x",
    });
  });

  it("should delete the real config file with resetConfig and recreate the defaults", () => {
    const key = trackedKey(CONFIGURATION.AUTHENTICATION);
    const filePath = configFilePath(key);
    const service = new ConfigurationManagerService(key);

    expect(fsSync.existsSync(filePath)).toBe(true);

    service.resetConfig();

    expect(fsSync.existsSync(filePath)).toBe(true);
    expect(service.getConfig()).toEqual(
      defaultConfiguration[CONFIGURATION.AUTHENTICATION],
    );
  });

  it("should throw a real error deleting a config file that does not exist", () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_missing_${Date.now()}`);
    const filePath = configFilePath(key);
    // Force-create then delete out from under the service to leave a dangling path.
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, "{}");
    const service = new ConfigurationManagerService(key);
    fsSync.unlinkSync(filePath);

    expect(() => service.deleteConfig()).toThrowError(
      expect.objectContaining({
        key: "@configuration_manager_service_reset_config_file/CONFIG_FILE_DELETE_ERROR",
      }),
    );
  });

  it("should throw a real error loading a config file with malformed JSON on disk", () => {
    const key = trackedKey(`${CONFIGURATION.COMMON}_malformed_${Date.now()}`);
    const filePath = configFilePath(key);
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
    fsSync.writeFileSync(filePath, "{not valid json");

    expect(() => new ConfigurationManagerService(key)).toThrowError(
      expect.objectContaining({
        key: "@configuration_manager_service_load_config/CONFIG_FILE_READ_ERROR",
      }),
    );
  });
});
