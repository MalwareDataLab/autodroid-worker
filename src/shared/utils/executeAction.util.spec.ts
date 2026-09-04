import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { sleep } from "./sleep.util";
import { logger } from "./logger";

// Test target import
import { executeAction } from "./executeAction.util";

vi.mock("@config/env", () => ({ getEnvConfig: vi.fn() }));
vi.mock("./sleep.util", () => ({ sleep: vi.fn() }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

const setTestEnv = (isTestEnv: boolean) =>
  (getEnvConfig as Mock).mockReturnValue({ isTestEnv });

describe("Utils: executeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sleep as Mock).mockResolvedValue(undefined);
    setTestEnv(true);
  });

  it("should return the result without logging on the test environment", async () => {
    const result = await executeAction({
      action: () => Promise.resolve("value"),
      logging: true,
    });

    expect(result).toBe("value");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("should log a success message on the first attempt", async () => {
    setTestEnv(false);

    await executeAction({
      actionName: "Sync",
      action: () => Promise.resolve("value"),
      logging: true,
    });

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Sync success."),
    );
  });

  it("should retry and log the successful attempt number", async () => {
    setTestEnv(false);

    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("value");

    const result = await executeAction({
      actionName: "Sync",
      action,
      retryDelay: 10,
      logging: true,
    });

    expect(result).toBe("value");
    expect(logger.error).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(10);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("success with attempt 2"),
    );
  });

  it("should throw after exhausting the retries using the default delay", async () => {
    setTestEnv(false);

    const action = vi.fn().mockRejectedValue(new Error("boom"));

    const error = await executeAction({
      actionName: "Sync",
      action,
      maxRetries: 1,
    }).catch(thrown => thrown);

    expect(error).toEqual(
      expect.objectContaining({ key: "@execute_action_util/RUN" }),
    );
    expect(error.message).toContain("failure after 1 retries");
    expect(error.message).toContain("boom");
    expect(sleep).toHaveBeenCalledWith(5000);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should tolerate a thrown value without a message", async () => {
    const action = vi.fn().mockRejectedValue(undefined);

    const error = await executeAction({ action }).catch(thrown => thrown);

    expect(error).toEqual(
      expect.objectContaining({ key: "@execute_action_util/RUN" }),
    );
    expect(error.message).toContain("Action failure after 0 retries");
  });
});
