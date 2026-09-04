import fsSync from "node:fs";
import os from "node:os";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Config import
import { getEnvConfig } from "@config/env";

// Test target import
import { getSystemEnvironment } from "./getSystemEnvironment.util";

vi.mock("@config/env", () => ({ getEnvConfig: vi.fn(() => ({})) }));
vi.mock("node:fs", () => ({ default: { existsSync: vi.fn() } }));
vi.mock("node:os", () => ({ default: { platform: vi.fn() } }));

const setEnv = (env: Record<string, unknown>) =>
  (getEnvConfig as Mock).mockReturnValue(env);

describe("Utils: getSystemEnvironment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fsSync.existsSync as Mock).mockReturnValue(false);
    (os.platform as Mock).mockReturnValue("linux");
  });

  it("should return test on the test environment", () => {
    setEnv({ isTestEnv: true });

    expect(getSystemEnvironment()).toBe("test");
  });

  it("should return container when running inside docker", () => {
    setEnv({ isTestEnv: false });
    (fsSync.existsSync as Mock).mockReturnValue(true);

    expect(getSystemEnvironment()).toBe("container");
  });

  it("should return development on the development environment", () => {
    setEnv({ isTestEnv: false, NODE_ENV: "development" });

    expect(getSystemEnvironment()).toBe("development");
  });

  it("should return linux on a linux platform", () => {
    setEnv({ isTestEnv: false, NODE_ENV: "production" });
    (os.platform as Mock).mockReturnValue("linux");

    expect(getSystemEnvironment()).toBe("linux");
  });

  it("should return windows on a win32 platform", () => {
    setEnv({ isTestEnv: false, NODE_ENV: "production" });
    (os.platform as Mock).mockReturnValue("win32");

    expect(getSystemEnvironment()).toBe("windows");
  });

  it("should return macos on a darwin platform", () => {
    setEnv({ isTestEnv: false, NODE_ENV: "production" });
    (os.platform as Mock).mockReturnValue("darwin");

    expect(getSystemEnvironment()).toBe("macos");
  });

  it("should throw on an unknown platform", () => {
    setEnv({ isTestEnv: false, NODE_ENV: "production" });
    (os.platform as Mock).mockReturnValue("sunos");

    let error: unknown;
    try {
      getSystemEnvironment();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toEqual(
      expect.objectContaining({
        key: "@configuration_manager_service_get_environment/UNKNOWN_PLATFORM",
      }),
    );
  });
});
