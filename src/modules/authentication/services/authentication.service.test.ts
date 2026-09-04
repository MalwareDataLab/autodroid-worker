import fsSync from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Util import
import { getStorageBasePath } from "@shared/utils/getStorageBasePath.util";

// Enum import
import { CONFIGURATION } from "@modules/configuration/types/configuration.enum";

// Type import
import type { AppContext } from "@shared/types/appContext.type";

// Target import
import { AuthenticationService } from "./authentication.service";

const mocks = vi.hoisted(() => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

// The backend API is a genuine external dependency — mocked. Everything else
// (ConfigurationManagerService, real filesystem persistence) runs for real.
vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => mocks.apiClient),
    isAxiosError: vi.fn(() => false),
  },
  Axios: class {},
}));

const configFilePath = getStorageBasePath(`${CONFIGURATION.AUTHENTICATION}.json`);

const readRealConfig = () =>
  JSON.parse(fsSync.readFileSync(configFilePath, "utf-8"));

const removeRealConfig = () => {
  if (fsSync.existsSync(configFilePath)) fsSync.unlinkSync(configFilePath);
};

const buildContext = () => ({}) as AppContext;

const registerResponse = () => ({
  data: {
    id: "22222222-2222-2222-2222-222222222222",
    refresh_token: "refresh.jwt.token",
    refresh_token_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
});

const accessTokenResponse = () => ({
  data: {
    access_token: "access-token-value",
    access_token_expires_at: new Date(Date.now() + 3600000).toISOString(),
  },
});

describe("Integration: AuthenticationService against a real ConfigurationManagerService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeRealConfig();
  });

  afterEach(() => {
    removeRealConfig();
  });

  it("should throw synchronously when neither a persisted nor a passed registration token exists", () => {
    expect(
      () =>
        new AuthenticationService({
          name: "worker-1",
          registration_token: null,
          context: buildContext(),
        }),
    ).toThrowError(
      expect.objectContaining({
        key: "@authentication_service_init/MISSING_REGISTRATION_TOKEN",
      }),
    );

    // ConfigurationManagerService already persisted the real default config
    // file to disk before the missing-token check runs — real load-then-check
    // ordering, not something a mocked config layer would reveal.
    expect(fsSync.existsSync(configFilePath)).toBe(true);
    expect(readRealConfig().registration_token).toBeNull();
  });

  it("should register, persist the real session to disk, and fetch current data on first init", async () => {
    mocks.apiClient.post.mockImplementation((url: string) => {
      if (url === "/register") return Promise.resolve(registerResponse());
      if (url === "/access-token") return Promise.resolve(accessTokenResponse());
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    mocks.apiClient.get.mockResolvedValue({ data: { id: "worker" } });

    const service = new AuthenticationService({
      name: "worker-1",
      registration_token: "a-real-registration-token",
      context: buildContext(),
    });

    await service.initialization;

    expect(mocks.apiClient.post).toHaveBeenCalledWith(
      "/register",
      expect.objectContaining({ registration_token: "a-real-registration-token" }),
    );
    expect(mocks.apiClient.get).toHaveBeenCalledWith(
      "/",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token-value" },
      }),
    );

    const config = service.getConfig();
    expect(config.worker_id).toBe("22222222-2222-2222-2222-222222222222");
    expect(config.access_token).toBe("access-token-value");
    expect(config.internal_id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/,
    );
    expect(config.signature).toMatch(/^[\da-f]{64}$/);

    // Prove it is really on disk, not just held in memory.
    const persisted = readRealConfig();
    expect(persisted.worker_id).toBe(config.worker_id);
    expect(persisted.access_token).toBe("access-token-value");
    expect(persisted.auth_failure_reported).toBe(false);
  });

  it("should reuse a real, already-persisted session and skip registration on the next instantiation", async () => {
    mocks.apiClient.post.mockImplementation((url: string) => {
      if (url === "/register") return Promise.resolve(registerResponse());
      if (url === "/access-token") return Promise.resolve(accessTokenResponse());
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    mocks.apiClient.get.mockResolvedValue({ data: { id: "worker" } });

    const first = new AuthenticationService({
      name: "worker-1",
      registration_token: "a-real-registration-token",
      context: buildContext(),
    });
    await first.initialization;

    mocks.apiClient.post.mockClear();

    const second = new AuthenticationService({
      name: "worker-1",
      registration_token: null,
      context: buildContext(),
    });
    await second.initialization;

    expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
      "/register",
      expect.anything(),
    );
    expect(second.getConfig().worker_id).toBe(first.getConfig().worker_id);
  });

  it(
    "should persist the real auth-failure flag to disk after registration exhausts its retries",
    async () => {
      mocks.apiClient.post.mockImplementation((url: string) => {
        if (url === "/register")
          return Promise.reject(new Error("network down"));
        return Promise.reject(new Error(`unexpected POST ${url}`));
      });

      const service = new AuthenticationService({
        name: "worker-1",
        registration_token: "a-real-registration-token",
        context: buildContext(),
      });

      await expect(service.initialization).rejects.toThrowError(
        expect.objectContaining({ key: "@execute_action_util/RUN" }),
      );

      const persisted = readRealConfig();
      expect(persisted.auth_failure_reported).toBe(true);
      expect(persisted.worker_id).toBeNull();
    },
    // 5 real retries at 1s apart, each doing a real (unmocked) system-info
    // collection twice (signature + registration payload) — genuinely slow,
    // not a hang.
    40000,
  );

  it("should refresh only the access token on a session with a fresh refresh token", async () => {
    mocks.apiClient.post.mockImplementation((url: string) => {
      if (url === "/register") return Promise.resolve(registerResponse());
      if (url === "/access-token") return Promise.resolve(accessTokenResponse());
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });
    mocks.apiClient.get.mockResolvedValue({ data: { id: "worker" } });

    const service = new AuthenticationService({
      name: "worker-1",
      registration_token: "a-real-registration-token",
      context: buildContext(),
    });
    await service.initialization;

    mocks.apiClient.post.mockClear();
    const nextAccessToken = accessTokenResponse();
    mocks.apiClient.post.mockImplementation((url: string) => {
      if (url === "/access-token") return Promise.resolve(nextAccessToken);
      return Promise.reject(new Error(`unexpected POST ${url}`));
    });

    const refreshed = await service.refreshAuthentication({
      forceAccessTokenUpdate: true,
    });

    expect(mocks.apiClient.post).toHaveBeenCalledWith(
      "/access-token",
      expect.anything(),
    );
    expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
      "/refresh-token",
      expect.anything(),
    );
    expect(refreshed.access_token).toBe(nextAccessToken.data.access_token);

    const persisted = readRealConfig();
    expect(persisted.access_token).toBe(nextAccessToken.data.access_token);
  });
});
