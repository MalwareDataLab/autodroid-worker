import { afterEach, beforeEach, describe, expect, it } from "vitest";

import APP_INFO from "@/package.json";

// Test target import
import { getEnvConfig } from "./env";

const setEnv = (key: string, value: string) =>
  Reflect.set(process.env, key, value);

const unsetEnv = (key: string) => Reflect.deleteProperty(process.env, key);

describe("Config: getEnvConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should flag the test environment regardless of the casing", () => {
    setEnv("NODE_ENV", "TEST");

    expect(getEnvConfig().isTestEnv).toBe(true);
  });

  it("should not flag the test environment outside of it", () => {
    setEnv("NODE_ENV", "production");

    expect(getEnvConfig().isTestEnv).toBe(false);
  });

  it("should not flag the test environment when NODE_ENV is unset", () => {
    unsetEnv("NODE_ENV");

    expect(getEnvConfig().isTestEnv).toBe(false);
  });

  it("should coerce the DEBUG flag into a boolean", () => {
    setEnv("DEBUG", "true");
    expect(getEnvConfig().DEBUG).toBe(true);

    setEnv("DEBUG", "false");
    expect(getEnvConfig().DEBUG).toBe(false);

    unsetEnv("DEBUG");
    expect(getEnvConfig().DEBUG).toBe(false);
  });

  it("should expose the process environment alongside the app info", () => {
    setEnv("API_BASE_URL", "http://api");

    const config = getEnvConfig();

    expect(config.API_BASE_URL).toBe("http://api");
    expect(config.APP_INFO).toBe(APP_INFO);
  });
});
