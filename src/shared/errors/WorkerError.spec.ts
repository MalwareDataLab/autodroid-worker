import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Configuration import
import { getEnvConfig } from "@config/env";

// Util import
import { logger } from "@shared/utils/logger";

// Infrastructure import
import { Sentry } from "@shared/infrastructure/sentry";

// Target import
import { WorkerError } from "./WorkerError";

vi.mock("@config/env", () => ({ getEnvConfig: vi.fn() }));
vi.mock("@shared/utils/logger", () => ({ logger: { error: vi.fn() } }));

const setEnv = (env: Record<string, unknown>) =>
  (getEnvConfig as Mock).mockReturnValue({
    WORKER_ID: "worker-id",
    NAME: "worker-name",
    APP_INFO: { version: "1.0.0" },
    NODE_ENV: "production",
    DEBUG: false,
    isTestEnv: true,
    ...env,
  });

describe("Error: WorkerError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv({});
  });

  it("should build an error without debug metadata", async () => {
    const error = new WorkerError({ key: "@test/KEY", message: "boom" });
    await error.action;

    expect(error.name).toBe("@test/KEY");
    expect(error.message).toBe("boom");
    expect(error.key).toBe("@test/KEY");
    expect(error.handler).toBe("WorkerError");
    expect(error.errorCode).toEqual(expect.any(String));
    expect(error.debug).toBeUndefined();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("should attach sanitized debug metadata with worker context", async () => {
    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      debug: { detail: "value" },
    });
    await error.action;

    expect(error.debug).toEqual(
      expect.objectContaining({
        detail: "value",
        error_code: error.errorCode,
        _worker_id: "worker-id",
        _worker_name: "worker-name",
        _worker_version: "1.0.0",
        _worker_env: "production",
      }),
    );
  });

  it("should report to sentry and log when debug mode is on outside the test env", async () => {
    setEnv({ isTestEnv: false, DEBUG: true });

    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      debug: { detail: "value" },
    });
    await error.action;

    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it("should report to sentry without logging when debug mode is off", async () => {
    setEnv({ isTestEnv: false, DEBUG: false });

    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      debug: { detail: "value" },
    });
    await error.action;

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should skip reporting when register is disabled", async () => {
    setEnv({ isTestEnv: false });

    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      debug: { disableRegister: true },
    });
    await error.action;

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("should skip reporting when there is no debug even outside the test env", async () => {
    setEnv({ isTestEnv: false });

    const error = new WorkerError({ key: "@test/KEY", message: "boom" });
    await error.action;

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("should expose the given status code", () => {
    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      statusCode: 502,
    });

    expect(error.statusCode).toBe(502);
  });

  it("should report to sentry for a server-error status code even without debug metadata", async () => {
    setEnv({ isTestEnv: false });

    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      statusCode: 500,
    });
    await error.action;

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("should skip reporting for a client-error status code without debug metadata", async () => {
    setEnv({ isTestEnv: false });

    const error = new WorkerError({
      key: "@test/KEY",
      message: "boom",
      statusCode: 400,
    });
    await error.action;

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("should build the error when captureStackTrace is unavailable", async () => {
    const original = Error.captureStackTrace;
    // @ts-expect-error removing the optional helper to exercise the fallback
    delete Error.captureStackTrace;

    const error = new WorkerError({ key: "@test/KEY", message: "boom" });
    await error.action;

    Error.captureStackTrace = original;

    expect(error.key).toBe("@test/KEY");
  });

  it("should build an instance through make", () => {
    const error = WorkerError.make({ key: "@test/KEY", message: "boom" });

    expect(error).toBeInstanceOf(WorkerError);
  });

  it("should identify instances with isInstance", () => {
    expect(WorkerError.isInstance(null)).toBe(false);
    expect(
      WorkerError.isInstance(new WorkerError({ key: "@k", message: "m" })),
    ).toBe(true);
    expect(WorkerError.isInstance({ handler: "WorkerError" })).toBe(true);
    expect(WorkerError.isInstance({ handler: "Error" })).toBe(false);
    expect(WorkerError.isInstance({ handler: "other" })).toBe(false);
  });
});
