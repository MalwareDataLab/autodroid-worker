import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  startProfiler: vi.fn(),
  nodeProfilingIntegration: vi.fn(() => "profiling-integration"),
  getEnvConfig: vi.fn(),
}));

vi.unmock("@shared/infrastructure/sentry");
vi.mock("@sentry/node", () => ({
  init: mocks.init,
  profiler: { startProfiler: mocks.startProfiler },
}));
vi.mock("@sentry/profiling-node", () => ({
  nodeProfilingIntegration: mocks.nodeProfilingIntegration,
}));
vi.mock("@config/env", () => ({ getEnvConfig: mocks.getEnvConfig }));

describe("Infrastructure: Sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should initialize sentry with the worker environment and start the profiler", async () => {
    mocks.getEnvConfig.mockReturnValue({
      NODE_ENV: "production",
      NAME: "worker-name",
    });

    await import(".");

    expect(mocks.init).toHaveBeenCalledWith({
      dsn: "https://60d89a205f07dafa3b503f8e4c32f238@o4508853891497984.ingest.us.sentry.io/4508894352048128",
      integrations: ["profiling-integration"],
      tracesSampleRate: 1.0,
      environment: "production",
      serverName: "worker-name",
    });
    expect(mocks.startProfiler).toHaveBeenCalledTimes(1);
  });

  it("should initialize sentry with the development environment", async () => {
    mocks.getEnvConfig.mockReturnValue({
      NODE_ENV: "development",
      NAME: "other-worker",
    });

    await import(".");

    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "development",
        serverName: "other-worker",
      }),
    );
  });
});
