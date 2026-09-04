import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Util import
import { logger } from "@shared/utils/logger";
import { executeAction } from "@shared/utils/executeAction.util";

// Type import
import { AppContext } from "@shared/types/appContext.type";

// Test target import
import { WebSocketApp } from ".";

const mocks = vi.hoisted(() => {
  const socket = {
    connected: false,
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    io: { on: vi.fn() },
  };
  return {
    socket,
    io: vi.fn((_url: string, _options: { auth: unknown }) => socket),
  };
});

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("@shared/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/utils/executeAction.util", () => ({
  executeAction: vi.fn(),
}));

const buildContext = (overrides: Record<string, unknown> = {}): AppContext =>
  ({
    api: { config: { baseUrl: "http://api" } },
    authentication: {
      getConfig: vi.fn(() => ({ access_token: "token" })),
      refreshAuthentication: vi.fn(),
    },
    ...overrides,
  }) as never;

const findOn = (target: { on: ReturnType<typeof vi.fn> }, event: string) =>
  target.on.mock.calls.find(call => call[0] === event)![1];

const findOnce = (target: { once: ReturnType<typeof vi.fn> }, event: string) =>
  target.once.mock.calls.find(call => call[0] === event)![1];

describe("Infrastructure: WebSocketApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.socket.connected = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create the socket and provide the auth token", () => {
      const context = buildContext();

      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context });

      const options = mocks.io.mock.calls[0][1] as { auth: any };
      const getAuthToken = vi.fn();
      options.auth(getAuthToken);

      expect(getAuthToken).toHaveBeenCalledWith({
        kind: "WORKER",
        token: "Bearer token",
      });
    });

    it("should throw when the access token is missing", () => {
      const context = buildContext({
        authentication: {
          getConfig: vi.fn(() => ({ access_token: undefined })),
          refreshAuthentication: vi.fn(),
        },
      });

      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context });

      const options = mocks.io.mock.calls[0][1] as { auth: any };

      expect(() => options.auth(vi.fn())).toThrow("Access token is required");
    });
  });

  describe("init", () => {
    it("should connect when the socket is not connected", async () => {
      (executeAction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (params: { action: () => Promise<void> }) => params.action(),
      );
      const app = new WebSocketApp({ context: buildContext() });
      const connect = vi
        .spyOn(app as unknown as { connect: () => Promise<void> }, "connect")
        .mockResolvedValue(undefined);

      await app.init();

      expect(executeAction).toHaveBeenCalled();
      expect(connect).toHaveBeenCalled();
    });

    it("should skip connecting when the socket is already connected", async () => {
      mocks.socket.connected = true;
      const app = new WebSocketApp({ context: buildContext() });

      await app.init();

      expect(executeAction).not.toHaveBeenCalled();
    });
  });

  describe("connect", () => {
    it("should resolve when the connection succeeds", async () => {
      const app = new WebSocketApp({ context: buildContext() });

      const promise = (
        app as unknown as { connect: () => Promise<void> }
      ).connect();

      const onSuccess = findOnce(mocks.socket as any, "connect");
      onSuccess();

      await expect(promise).resolves.toBeUndefined();
      expect(mocks.socket.off).toHaveBeenCalledTimes(2);
    });

    it("should reject and disconnect when the connection errors", async () => {
      const app = new WebSocketApp({ context: buildContext() });

      const promise = (
        app as unknown as { connect: () => Promise<void> }
      ).connect();

      const onError = findOnce(mocks.socket as any, "connect_error");
      onError(new Error("connect error"));

      await expect(promise).rejects.toThrow("connect error");
      expect(mocks.socket.disconnect).toHaveBeenCalled();
    });

    it("should reject when starting the connection throws", async () => {
      mocks.socket.connect.mockImplementationOnce(() => {
        throw new Error("connect throw");
      });
      const app = new WebSocketApp({ context: buildContext() });

      await expect(
        (app as unknown as { connect: () => Promise<void> }).connect(),
      ).rejects.toThrow("connect throw");
      expect(mocks.socket.disconnect).toHaveBeenCalled();
    });
  });

  describe("common listeners", () => {
    it("should log lifecycle events", () => {
      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context: buildContext() });

      findOn(mocks.socket as any, "connect")();
      findOn(mocks.socket as any, "disconnect")();
      findOn(mocks.socket.io as any, "error")({ message: "io error" });
      findOn(mocks.socket.io as any, "reconnect_attempt")();
      findOn(mocks.socket.io as any, "reconnect_error")({ message: "re err" });
      findOn(mocks.socket.io as any, "reconnect_failed")();
      findOn(mocks.socket.io as any, "reconnect")();

      expect(logger.info).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it("should ignore connection errors that are not unauthorized", () => {
      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context: buildContext() });

      findOn(mocks.socket as any, "connect_error")({ message: "boom" });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("connection error"),
      );
    });

    it("should refresh authentication on unauthorized connection errors", async () => {
      mocks.socket.connected = true;
      const refreshAuthentication = vi.fn(() => Promise.resolve());
      const context = buildContext({
        authentication: {
          getConfig: vi.fn(() => ({ access_token: "token" })),
          refreshAuthentication,
        },
      });
      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context });

      findOn(mocks.socket as any, "connect_error")({ message: "Unauthorized" });
      await vi.waitFor(() => expect(refreshAuthentication).toHaveBeenCalled());
    });

    it("should exit when refreshing authentication fails", async () => {
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const refreshAuthentication = vi.fn(() =>
        Promise.reject(new Error("refresh failed")),
      );
      const context = buildContext({
        authentication: {
          getConfig: vi.fn(() => ({ access_token: "token" })),
          refreshAuthentication,
        },
      });
      // eslint-disable-next-line no-new -- constructed for its constructor side effect, the instance itself is never used
      new WebSocketApp({ context });

      findOn(mocks.socket as any, "connect_error")({ message: "unauthorized" });
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    });
  });

  describe("disconnect and status", () => {
    it("should disconnect the socket", () => {
      const app = new WebSocketApp({ context: buildContext() });

      app.disconnect();

      expect(mocks.socket.disconnect).toHaveBeenCalled();
    });

    it("should report the connection status", () => {
      mocks.socket.connected = true;
      const app = new WebSocketApp({ context: buildContext() });

      expect(app.getIsConnected()).toBe(true);
    });
  });
});
