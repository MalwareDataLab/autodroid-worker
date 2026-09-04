import { beforeEach, describe, expect, it, vi } from "vitest";

// Util import
import { logger } from "@shared/utils/logger";

// Type import
import { AppContext } from "@shared/types/appContext.type";

// Test target import
import { Api } from ".";

const mocks = vi.hoisted(() => ({
  client: { interceptors: { request: { use: vi.fn() } } },
}));

vi.mock("axios", () => ({ default: { create: vi.fn(() => mocks.client) } }));
vi.mock("@config/api", () => ({
  getApiConfig: vi.fn(() => ({ baseUrl: "http://api" })),
}));
vi.mock("@shared/utils/retryExecution.util", () => ({
  retryExecution: () => (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@shared/utils/logger", () => ({ logger: { error: vi.fn() } }));

const buildContext = (
  refreshAuthentication: () => Promise<unknown>,
): AppContext => ({ authentication: { refreshAuthentication } }) as never;

describe("Infrastructure: Api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should inject the refreshed access token into the request headers", async () => {
    const context = buildContext(() =>
      Promise.resolve({ access_token: "token" }),
    );

    const api = new Api({ context });

    expect(api.config).toEqual({ baseUrl: "http://api" });

    const interceptor = mocks.client.interceptors.request.use.mock.calls[0][0];
    const config = await interceptor({ headers: {} });

    expect(config.headers.Authorization).toBe("Bearer token");
  });

  it("should log and exit when refreshing the token fails", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const context = buildContext(() => Promise.reject(new Error("failed")));

    // eslint-disable-next-line no-new -- constructed for its interceptor-registration side effect, the instance itself is never used
    new Api({ context });

    const interceptor = mocks.client.interceptors.request.use.mock.calls[0][0];
    await interceptor({ headers: {} });

    expect(logger.error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);

    exit.mockRestore();
  });
});
