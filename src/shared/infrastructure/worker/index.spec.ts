import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Util import
import { logger } from "@shared/utils/logger";

// Test target import
import { Worker } from ".";

const mocks = vi.hoisted(() => ({
  authentication: { initialization: Promise.resolve() },
  api: {},
  webSocketClient: { init: vi.fn(() => Promise.resolve()) },
  processing: { init: vi.fn(() => Promise.resolve()) },
  AuthenticationService: vi.fn(),
  Api: vi.fn(),
  WebSocketApp: vi.fn(),
  ProcessingService: vi.fn(),
}));

vi.mock("@shared/utils/logger", () => ({
  logger: { error: vi.fn() },
}));
vi.mock("@modules/authentication/services/authentication.service", () => ({
  AuthenticationService: mocks.AuthenticationService,
}));
vi.mock("@shared/infrastructure/api", () => ({ Api: mocks.Api }));
vi.mock("@shared/infrastructure/websocket", () => ({
  WebSocketApp: mocks.WebSocketApp,
}));
vi.mock("@modules/processing/services/processing.service", () => ({
  ProcessingService: mocks.ProcessingService,
}));

describe("Infrastructure: Worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authentication.initialization = Promise.resolve();
    mocks.webSocketClient.init.mockResolvedValue(undefined);
    mocks.processing.init.mockResolvedValue(undefined);
    mocks.AuthenticationService.mockImplementation(() => mocks.authentication);
    mocks.Api.mockImplementation(() => mocks.api);
    mocks.WebSocketApp.mockImplementation(() => mocks.webSocketClient);
    mocks.ProcessingService.mockImplementation(() => mocks.processing);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should instantiate the services and initialize them", async () => {
    const worker = new Worker({ name: "worker", registration_token: "reg" });

    await worker.initialization;

    expect(mocks.AuthenticationService).toHaveBeenCalled();
    expect(mocks.webSocketClient.init).toHaveBeenCalled();
    expect(mocks.processing.init).toHaveBeenCalled();
  });

  it("should log and exit when initialization fails", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    mocks.webSocketClient.init.mockRejectedValueOnce(new Error("init failed"));

    const worker = new Worker({ name: "worker", registration_token: "reg" });

    await worker.initialization;

    expect(logger.error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
