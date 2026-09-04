import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { isHash, isJWT, isUUID } from "validator";
import axios from "axios";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Util import
import { logger } from "@shared/utils/logger";
import { DateHelpers } from "@shared/utils/dateHelper.util";
import { executeAction } from "@shared/utils/executeAction.util";
import { getSystemStaticInfo } from "@shared/utils/getSystemStaticInfo.util";

// Test target import
import { AuthenticationService } from "./authentication.service";

const mocks = vi.hoisted(() => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
  configManager: {
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    setConfigValue: vi.fn(),
  },
  store: { data: {} as Record<string, unknown> },
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => mocks.apiClient),
    isAxiosError: vi.fn(() => false),
  },
  Axios: class {},
}));
vi.mock("@modules/configuration/services/configurationManager.service", () => ({
  ConfigurationManagerService: vi.fn(() => mocks.configManager),
}));
vi.mock("@config/api", () => ({
  getApiConfig: vi.fn(() => ({ baseUrl: "http://api" })),
}));
vi.mock("@config/env", () => ({
  getEnvConfig: vi.fn(() => ({
    isTestEnv: true,
    APP_INFO: { version: "1.0.0" },
    WORKER_ID: "w",
    NAME: "n",
    NODE_ENV: "test",
    DEBUG: false,
  })),
}));
vi.mock("validator", () => ({
  isHash: vi.fn(),
  isJWT: vi.fn(),
  isUUID: vi.fn(),
}));
vi.mock("@shared/utils/dateHelper.util", () => ({
  DateHelpers: { parseISOString: vi.fn(), parse: vi.fn(), now: vi.fn() },
}));
vi.mock("@shared/utils/executeAction.util", () => ({ executeAction: vi.fn() }));
vi.mock("@shared/utils/retryExecution.util", () => ({
  retryExecution: () => (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@shared/utils/getErrorMessage.util", () => ({
  getErrorMessage: vi.fn(() => "error"),
}));
vi.mock("@shared/utils/getSystemStaticInfo.util", () => ({
  getSystemStaticInfo: vi.fn(async () => ({ system: "info" })),
}));
vi.mock("@shared/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const INTERNAL_ID = "11111111-1111-1111-1111-111111111111";
const WORKER_ID = "22222222-2222-2222-2222-222222222222";
const SIGNATURE_OF_INTERNAL_ID =
  "94f08551026e020faf2a43ce85eff69a76904994d3556a128c9ff9e00f223bad";
const UUID_PATTERN =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;

const registerPayload = (registration_token: string) => ({
  name: "worker",
  registration_token,
  internal_id: INTERNAL_ID,
  signature: "hash",
  system_info: { system: "info" },
});

const sessionPayload = () => ({
  name: "worker",
  system_info: { system: "info" },
  registration_token: "reg",
  internal_id: INTERNAL_ID,
  signature: "hash",
  worker_id: WORKER_ID,
  refresh_token: "jwt",
});

const validConfig = (): Record<string, unknown> => ({
  name: "worker",
  registration_token: "reg",
  signature: "hash",
  internal_id: INTERNAL_ID,
  worker_id: WORKER_ID,
  refresh_token: "jwt",
  refresh_token_expires_at: "2024-01-01T00:00:00Z",
  access_token: "tok",
  access_token_expires_at: "2024-01-01T00:00:00Z",
  auth_failure_reported: false,
});

const makeService = (
  data: Record<string, unknown> = {},
  registration_token: string | null = "reg",
) => {
  mocks.store.data = data;
  return new AuthenticationService({
    name: "worker",
    registration_token,
    context: {} as never,
  });
};

const buildService = (registration_token: string | null = "reg") =>
  makeService(validConfig(), registration_token);

const catchError = (fn: () => unknown) => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("Service: AuthenticationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "WORKER_ID");
    mocks.store.data = {};
    mocks.configManager.getConfig.mockImplementation(() => mocks.store.data);
    mocks.configManager.setConfig.mockImplementation(async data => {
      mocks.store.data = { ...mocks.store.data, ...data };
    });
    mocks.configManager.setConfigValue.mockImplementation(
      async (key, value) => {
        mocks.store.data = { ...mocks.store.data, [key]: value };
      },
    );
    (isHash as Mock).mockReturnValue(true);
    (isJWT as Mock).mockReturnValue(true);
    (isUUID as Mock).mockReturnValue(true);
    (DateHelpers.parseISOString as Mock).mockReturnValue({
      isValid: () => true,
      toDate: () => new Date(0),
    });
    (DateHelpers.parse as Mock).mockReturnValue({
      subtract: () => ({ isBefore: () => false }),
    });
    (DateHelpers.now as Mock).mockReturnValue({});
    (executeAction as Mock).mockResolvedValue(undefined);
    mocks.apiClient.get.mockResolvedValue({ data: {} });
    mocks.apiClient.post.mockResolvedValue({
      data: {
        id: "wid",
        refresh_token: "jwt",
        refresh_token_expires_at: "2024-01-01T00:00:00Z",
        access_token: "tok",
        access_token_expires_at: "2024-01-01T00:00:00Z",
      },
    });
  });

  describe("constructor", () => {
    it("should throw when there is no registration token in config nor params", () => {
      mocks.store.data = {};

      expect(
        catchError(
          () =>
            new AuthenticationService({
              name: "worker",
              registration_token: null,
              context: {} as never,
            }),
        ),
      ).toEqual(
        expect.objectContaining({
          key: "@authentication_service_init/MISSING_REGISTRATION_TOKEN",
        }),
      );
    });

    it("should create the api client and schedule the initialization with a params token", () => {
      const service = makeService({}, "reg");

      expect(service).toBeInstanceOf(AuthenticationService);
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: "http://api/worker",
      });
      expect(executeAction).toHaveBeenCalledWith({
        action: expect.any(Function),
        actionName: "Authentication initialization",
        retryDelay: 1000,
        maxRetries: 5,
        logging: true,
      });
    });

    it("should accept a registration token coming from config only", () => {
      const service = makeService({ registration_token: "cfg" }, null);

      expect(service.getConfig()).toEqual({ registration_token: "cfg" });
      expect(executeAction).toHaveBeenCalledTimes(1);
    });
  });

  describe("init", () => {
    it("should run the initialization action without forcing registration", async () => {
      makeService(validConfig(), "reg");
      const { action } = (executeAction as Mock).mock.calls[0][0];

      await action({ attempt: 1 });

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "name",
        "worker",
      );
      expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
        "/register",
        expect.anything(),
      );
      expect(logger.info).toHaveBeenCalledWith(
        `🆗 Worker v1.0.0 name worker id ${WORKER_ID}`,
      );
    });

    it("should force registration from the fifth attempt", async () => {
      const service = buildService();

      await (service as unknown as { init: (a: number) => Promise<void> }).init(
        5,
      );

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("reg"),
      );
    });
  });

  describe("getConfig", () => {
    it("should return the current configuration", () => {
      const service = buildService();
      mocks.store.data = { name: "worker" };

      expect(service.getConfig()).toEqual({ name: "worker" });
    });
  });

  describe("refreshAuthentication", () => {
    it("should skip registration and refresh, update the access token by force and set the worker id", async () => {
      const service = makeService(validConfig(), "reg");

      const result = await service.refreshAuthentication({
        forceAccessTokenUpdate: true,
      });

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/access-token",
        sessionPayload(),
      );
      expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
        "/refresh-token",
        expect.anything(),
      );
      expect(mocks.apiClient.get).toHaveBeenCalledWith("/", {
        headers: { Authorization: "Bearer tok" },
      });
      expect(process.env.WORKER_ID).toBe(WORKER_ID);
      expect(result).toEqual({
        ...validConfig(),
        auth_failure_reported: false,
      });
    });

    it("should default the params to an empty object when called without arguments", async () => {
      const service = makeService(validConfig(), "reg");

      const result = await service.refreshAuthentication();

      expect(mocks.apiClient.post).not.toHaveBeenCalled();
      expect(mocks.apiClient.get).toHaveBeenCalledWith("/", {
        headers: { Authorization: "Bearer tok" },
      });
      expect(result).toEqual({
        ...validConfig(),
        auth_failure_reported: false,
      });
    });

    it("should register on force and refresh both tokens leaving the worker id unset", async () => {
      const service = makeService(
        { ...validConfig(), worker_id: undefined },
        "reg",
      );

      await service.refreshAuthentication({
        forceRegistration: true,
        forceRefreshTokenUpdate: true,
      });

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("reg"),
      );
      expect(mocks.apiClient.post).toHaveBeenCalledWith("/refresh-token", {
        ...sessionPayload(),
        worker_id: "wid",
      });
      expect(mocks.apiClient.post).toHaveBeenCalledWith("/access-token", {
        ...sessionPayload(),
        worker_id: "wid",
      });
      expect(process.env.WORKER_ID).toBeUndefined();
    });

    it("should register when the config has no registration token", async () => {
      const service = makeService(
        { ...validConfig(), registration_token: undefined },
        "reg",
      );

      await service.refreshAuthentication({});

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("reg"),
      );
    });

    it("should register when the config has no refresh token", async () => {
      const service = makeService(
        { ...validConfig(), refresh_token: undefined },
        "reg",
      );

      await service.refreshAuthentication({});

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("reg"),
      );
    });

    it("should register when the params token differs from the config token", async () => {
      const service = makeService(validConfig(), "newtoken");

      await service.refreshAuthentication({});

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("newtoken"),
      );
      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "registration_token",
        "newtoken",
      );
    });

    it("should update both tokens when the refresh token needs a refresh", async () => {
      (DateHelpers.parse as Mock).mockReturnValue({
        subtract: () => ({ isBefore: () => true }),
      });
      const service = makeService(validConfig(), "reg");

      await service.refreshAuthentication({});

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/refresh-token",
        expect.anything(),
      );
      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/access-token",
        expect.anything(),
      );
    });

    it("should skip both token updates when nothing needs a refresh", async () => {
      const service = makeService(validConfig(), "reg");

      await service.refreshAuthentication({});

      expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
        "/refresh-token",
        expect.anything(),
      );
      expect(mocks.apiClient.post).not.toHaveBeenCalledWith(
        "/access-token",
        expect.anything(),
      );
      expect(mocks.apiClient.get).toHaveBeenCalledWith("/", {
        headers: { Authorization: "Bearer tok" },
      });
      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "auth_failure_reported",
        false,
      );
    });
  });

  describe("handleInternalId", () => {
    const handle = (service: AuthenticationService) =>
      (
        service as unknown as { handleInternalId: () => Promise<void> }
      ).handleInternalId();

    it("should assign an internal id when it is missing", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: undefined };

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "internal_id",
        expect.stringMatching(UUID_PATTERN),
      );
    });

    it("should assign an internal id when it is not a string", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: 123 };

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "internal_id",
        expect.stringMatching(UUID_PATTERN),
      );
    });

    it("should assign an internal id when it is not a valid uuid", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: "not-a-uuid" };
      (isUUID as Mock).mockReturnValue(false);

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "internal_id",
        expect.stringMatching(UUID_PATTERN),
      );
    });

    it("should keep a valid internal id", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: INTERNAL_ID };

      await handle(service);

      expect(mocks.configManager.setConfigValue).not.toHaveBeenCalledWith(
        "internal_id",
        expect.anything(),
      );
    });
  });

  describe("createSignature", () => {
    const create = (service: AuthenticationService) =>
      (
        service as unknown as { createSignature: () => Promise<string> }
      ).createSignature();

    it("should create a signature from the system info and internal id", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: INTERNAL_ID };

      await expect(create(service)).resolves.toBe(SIGNATURE_OF_INTERNAL_ID);
    });

    it("should throw when the internal id is missing", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: undefined };

      await expect(create(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_create_signature/MISSING_INTERNAL_ID",
        }),
      );
    });

    it("should throw when the internal id is not a valid uuid", async () => {
      const service = buildService();
      mocks.store.data = { internal_id: "bad" };
      (isUUID as Mock).mockReturnValue(false);

      await expect(create(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_create_signature/MISSING_INTERNAL_ID",
        }),
      );
    });
  });

  describe("handleSignature", () => {
    const handle = (service: AuthenticationService) =>
      (
        service as unknown as { handleSignature: () => Promise<void> }
      ).handleSignature();

    it("should create the signature when it is missing", async () => {
      const service = buildService();
      mocks.store.data = { signature: undefined, internal_id: INTERNAL_ID };

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "signature",
        SIGNATURE_OF_INTERNAL_ID,
      );
    });

    it("should create the signature when it is not a string", async () => {
      const service = buildService();
      mocks.store.data = { signature: 123, internal_id: INTERNAL_ID };

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "signature",
        SIGNATURE_OF_INTERNAL_ID,
      );
    });

    it("should create the signature when it is not a valid hash", async () => {
      const service = buildService();
      mocks.store.data = { signature: "bad", internal_id: INTERNAL_ID };
      (isHash as Mock).mockReturnValue(false);

      await handle(service);

      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "signature",
        SIGNATURE_OF_INTERNAL_ID,
      );
    });

    it("should keep a valid signature", async () => {
      const service = buildService();
      mocks.store.data = { signature: "hash", internal_id: INTERNAL_ID };

      await handle(service);

      expect(mocks.configManager.setConfigValue).not.toHaveBeenCalledWith(
        "signature",
        expect.anything(),
      );
    });
  });

  describe("validateRequiredConfigurationData", () => {
    const validate = (service: AuthenticationService) =>
      catchError(() =>
        (
          service as unknown as {
            validateRequiredConfigurationData: () => void;
          }
        ).validateRequiredConfigurationData(),
      );

    it("should pass with a fully valid configuration", () => {
      const service = buildService();
      mocks.store.data = validConfig();

      expect(validate(service)).toBeUndefined();
    });

    it("should throw when the name is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), name: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_NAME",
        }),
      );
    });

    it("should throw when the name is not a string", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), name: 123 };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_NAME",
        }),
      );
    });

    it("should throw when the registration token is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), registration_token: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_REGISTRATION_TOKEN",
        }),
      );
    });

    it("should throw when the signature is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), signature: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_SIGNATURE",
        }),
      );
    });

    it("should throw when the signature is not a valid hash", () => {
      const service = buildService();
      mocks.store.data = validConfig();
      (isHash as Mock).mockReturnValue(false);

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_SIGNATURE",
        }),
      );
    });

    it("should throw when the internal id is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), internal_id: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_INTERNAL_ID",
        }),
      );
    });

    it("should throw when the internal id is not a valid uuid", () => {
      const service = buildService();
      mocks.store.data = validConfig();
      (isUUID as Mock).mockReturnValue(false);

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_INTERNAL_ID",
        }),
      );
    });

    it("should throw when the worker id is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), worker_id: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_WORKER_ID",
        }),
      );
    });

    it("should throw when the worker id is not a valid uuid", () => {
      const service = buildService();
      mocks.store.data = validConfig();
      (isUUID as Mock).mockImplementation(value => value === INTERNAL_ID);

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_WORKER_ID",
        }),
      );
    });

    it("should throw when the refresh token is missing", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), refresh_token: undefined };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN",
        }),
      );
    });

    it("should throw when the refresh token is not a valid jwt", () => {
      const service = buildService();
      mocks.store.data = validConfig();
      (isJWT as Mock).mockReturnValue(false);

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN",
        }),
      );
    });

    it("should throw when the refresh token expiration is missing", () => {
      const service = buildService();
      mocks.store.data = {
        ...validConfig(),
        refresh_token_expires_at: undefined,
      };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN_EXPIRES_AT",
        }),
      );
    });

    it("should throw when the refresh token expiration is not a string", () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), refresh_token_expires_at: 123 };

      expect(validate(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN_EXPIRES_AT",
        }),
      );
    });
  });

  describe("validateAndGetRequiredConfigurationData", () => {
    it("should return the required data enriched with system info", async () => {
      const service = buildService();
      mocks.store.data = validConfig();

      const data = await (
        service as unknown as {
          validateAndGetRequiredConfigurationData: () => Promise<
            Record<string, unknown>
          >;
        }
      ).validateAndGetRequiredConfigurationData();

      expect(data).toEqual(sessionPayload());
      expect(getSystemStaticInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe("token expiration dates", () => {
    const getAccess = (service: AuthenticationService) =>
      catchError(() =>
        (
          service as unknown as {
            getAccessTokenExpirationDate: () => Date;
          }
        ).getAccessTokenExpirationDate(),
      );
    const getRefresh = (service: AuthenticationService) =>
      catchError(() =>
        (
          service as unknown as {
            getRefreshTokenExpirationDate: () => Date;
          }
        ).getRefreshTokenExpirationDate(),
      );

    it("should throw when the access token expiration is missing", () => {
      const service = buildService();
      mocks.store.data = { access_token_expires_at: undefined };

      expect(getAccess(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_access_token_expiration_date/MISSING_ACCESS_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should throw when the access token expiration is not a string", () => {
      const service = buildService();
      mocks.store.data = { access_token_expires_at: 123 };

      expect(getAccess(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_access_token_expiration_date/MISSING_ACCESS_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should throw when the access token expiration is invalid", () => {
      const service = buildService();
      mocks.store.data = { access_token_expires_at: "bad" };
      (DateHelpers.parseISOString as Mock).mockReturnValue({
        isValid: () => false,
      });

      expect(getAccess(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_access_token_expiration_date/INVALID_ACCESS_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should return the parsed access token expiration date", () => {
      const service = buildService();
      mocks.store.data = { access_token_expires_at: "2024-01-01T00:00:00Z" };

      expect(
        (
          service as unknown as { getAccessTokenExpirationDate: () => Date }
        ).getAccessTokenExpirationDate(),
      ).toBeInstanceOf(Date);
    });

    it("should throw when the refresh token expiration is missing", () => {
      const service = buildService();
      mocks.store.data = { refresh_token_expires_at: undefined };

      expect(getRefresh(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_refresh_token_expiration_date/MISSING_REFRESH_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should throw when the refresh token expiration is not a string", () => {
      const service = buildService();
      mocks.store.data = { refresh_token_expires_at: 123 };

      expect(getRefresh(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_refresh_token_expiration_date/MISSING_REFRESH_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should throw when the refresh token expiration is invalid", () => {
      const service = buildService();
      mocks.store.data = { refresh_token_expires_at: "bad" };
      (DateHelpers.parseISOString as Mock).mockReturnValue({
        isValid: () => false,
      });

      expect(getRefresh(service)).toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_refresh_token_expiration_date/INVALID_REFRESH_TOKEN_EXPIRATION_DATE",
        }),
      );
    });

    it("should return the parsed refresh token expiration date", () => {
      const service = buildService();
      mocks.store.data = { refresh_token_expires_at: "2024-01-01T00:00:00Z" };

      expect(
        (
          service as unknown as { getRefreshTokenExpirationDate: () => Date }
        ).getRefreshTokenExpirationDate(),
      ).toBeInstanceOf(Date);
    });
  });

  describe("accessTokenNeedsRefresh", () => {
    const needs = (service: AuthenticationService) =>
      (
        service as unknown as {
          accessTokenNeedsRefresh: () => boolean;
        }
      ).accessTokenNeedsRefresh();

    it("should need a refresh when the access token is missing", () => {
      const service = buildService();
      mocks.store.data = { access_token: undefined };

      expect(needs(service)).toBe(true);
    });

    it("should need a refresh when the access token is not a string", () => {
      const service = buildService();
      mocks.store.data = { access_token: 123 };

      expect(needs(service)).toBe(true);
    });

    it("should need a refresh when the expiration is missing", () => {
      const service = buildService();
      mocks.store.data = {
        access_token: "tok",
        access_token_expires_at: undefined,
      };

      expect(needs(service)).toBe(true);
    });

    it("should need a refresh when the expiration is not a string", () => {
      const service = buildService();
      mocks.store.data = { access_token: "tok", access_token_expires_at: 123 };

      expect(needs(service)).toBe(true);
    });

    it("should not need a refresh when the token is still valid", () => {
      const service = buildService();
      mocks.store.data = validConfig();

      expect(needs(service)).toBe(false);
    });

    it("should need a refresh when the token is close to expiring", () => {
      (DateHelpers.parse as Mock).mockReturnValue({
        subtract: () => ({ isBefore: () => true }),
      });
      const service = buildService();
      mocks.store.data = validConfig();

      expect(needs(service)).toBe(true);
    });
  });

  describe("refreshTokenNeedsRefresh", () => {
    const needs = (service: AuthenticationService) =>
      (
        service as unknown as {
          refreshTokenNeedsRefresh: () => boolean;
        }
      ).refreshTokenNeedsRefresh();

    it("should not need a refresh when the token is still valid", () => {
      const service = buildService();
      mocks.store.data = validConfig();

      expect(needs(service)).toBe(false);
    });

    it("should need a refresh when the token is close to expiring", () => {
      (DateHelpers.parse as Mock).mockReturnValue({
        subtract: () => ({ isBefore: () => true }),
      });
      const service = buildService();
      mocks.store.data = validConfig();

      expect(needs(service)).toBe(true);
    });
  });

  describe("registerAndSetSession", () => {
    const register = (service: AuthenticationService) =>
      (
        service as unknown as {
          registerAndSetSession: () => Promise<void>;
        }
      ).registerAndSetSession();

    it("should register using the params token and persist the session", async () => {
      const service = buildService("reg");
      mocks.store.data = { internal_id: INTERNAL_ID, signature: "hash" };

      await register(service);

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/register",
        registerPayload("reg"),
      );
      expect(mocks.configManager.setConfig).toHaveBeenCalledWith({
        name: "worker",
        worker_id: "wid",
        refresh_token: "jwt",
        refresh_token_expires_at: "2024-01-01T00:00:00Z",
      });
    });

    it("should register using the config token when there is no params token", async () => {
      const service = makeService({ registration_token: "cfg" }, null);

      await register(service);

      expect(mocks.apiClient.post).toHaveBeenCalledWith("/register", {
        name: "worker",
        registration_token: "cfg",
        internal_id: undefined,
        signature: undefined,
        system_info: { system: "info" },
      });
    });

    it("should throw when there is no registration token at all", async () => {
      const service = makeService({ registration_token: "x" }, null);
      mocks.store.data = {};

      await expect(register(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_register/MISSING_REGISTRATION_TOKEN",
        }),
      );
    });

    it("should rethrow a worker error raised during registration", async () => {
      const service = buildService("reg");
      mocks.apiClient.post.mockRejectedValueOnce(
        new WorkerError({ key: "@custom/ERR", message: "m" }),
      );

      await expect(register(service)).rejects.toEqual(
        expect.objectContaining({ key: "@custom/ERR" }),
      );
    });

    it("should flag the failure and attach debug on the first failure", async () => {
      const service = buildService("reg");
      mocks.store.data = {
        registration_token: "reg",
        auth_failure_reported: false,
      };
      const networkError = new Error("net");
      mocks.apiClient.post.mockRejectedValueOnce(networkError);

      await expect(register(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_register/REGISTRATION_FAILED",
          message: "Registration failed. error",
          debug: expect.objectContaining({ error: networkError }),
        }),
      );
      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "auth_failure_reported",
        true,
      );
    });

    it("should not reflag the failure when it was already reported", async () => {
      const service = buildService("reg");
      mocks.store.data = {
        registration_token: "reg",
        auth_failure_reported: true,
      };
      mocks.apiClient.post.mockRejectedValueOnce(new Error("net"));

      await expect(register(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_register/REGISTRATION_FAILED",
          debug: undefined,
        }),
      );
      expect(mocks.configManager.setConfigValue).not.toHaveBeenCalledWith(
        "auth_failure_reported",
        true,
      );
    });
  });

  describe("updateRefreshToken", () => {
    const update = (service: AuthenticationService) =>
      (
        service as unknown as {
          updateRefreshToken: () => Promise<void>;
        }
      ).updateRefreshToken();

    it("should update the refresh token and persist the session", async () => {
      const service = buildService();
      mocks.store.data = validConfig();

      await update(service);

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/refresh-token",
        sessionPayload(),
      );
      expect(mocks.configManager.setConfig).toHaveBeenCalledWith({
        worker_id: "wid",
        refresh_token: "jwt",
        refresh_token_expires_at: "2024-01-01T00:00:00Z",
      });
    });

    it("should rethrow a worker error raised during the update", async () => {
      const service = buildService();
      mocks.store.data = validConfig();
      mocks.apiClient.post.mockRejectedValueOnce(
        new WorkerError({ key: "@custom/ERR", message: "m" }),
      );

      await expect(update(service)).rejects.toEqual(
        expect.objectContaining({ key: "@custom/ERR" }),
      );
    });

    it("should flag the failure and attach debug on the first failure", async () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), auth_failure_reported: false };
      const networkError = new Error("net");
      mocks.apiClient.post.mockRejectedValueOnce(networkError);

      await expect(update(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_refresh_token/GET_REFRESH_TOKEN_FAILED",
          message: "Get refresh token failed. error",
          debug: expect.objectContaining({ error: networkError }),
        }),
      );
      expect(mocks.configManager.setConfigValue).toHaveBeenCalledWith(
        "auth_failure_reported",
        true,
      );
    });

    it("should not reflag the failure when it was already reported", async () => {
      const service = buildService();
      mocks.store.data = { ...validConfig(), auth_failure_reported: true };
      mocks.apiClient.post.mockRejectedValueOnce(new Error("net"));

      await expect(update(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_refresh_token/GET_REFRESH_TOKEN_FAILED",
          debug: undefined,
        }),
      );
      expect(mocks.configManager.setConfigValue).not.toHaveBeenCalledWith(
        "auth_failure_reported",
        true,
      );
    });
  });

  describe("updateAccessToken", () => {
    const update = (service: AuthenticationService) =>
      (
        service as unknown as {
          updateAccessToken: () => Promise<void>;
        }
      ).updateAccessToken();

    it("should update the access token and persist the session", async () => {
      const service = buildService();
      mocks.store.data = validConfig();

      await update(service);

      expect(mocks.apiClient.post).toHaveBeenCalledWith(
        "/access-token",
        sessionPayload(),
      );
      expect(mocks.configManager.setConfig).toHaveBeenCalledWith({
        access_token: "tok",
        access_token_expires_at: "2024-01-01T00:00:00Z",
      });
    });

    it("should rethrow a worker error raised during the update", async () => {
      const service = buildService();
      mocks.store.data = validConfig();
      mocks.apiClient.post.mockRejectedValueOnce(
        new WorkerError({ key: "@custom/ERR", message: "m" }),
      );

      await expect(update(service)).rejects.toEqual(
        expect.objectContaining({ key: "@custom/ERR" }),
      );
    });

    it("should wrap a generic error raised during the update", async () => {
      const service = buildService();
      mocks.store.data = validConfig();
      const networkError = new Error("net");
      mocks.apiClient.post.mockRejectedValueOnce(networkError);

      await expect(update(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_access_token/GET_ACCESS_TOKEN_FAILED",
          message: "Get access token failed. error",
          debug: expect.objectContaining({ error: networkError }),
        }),
      );
    });
  });

  describe("getCurrentData", () => {
    const get = (service: AuthenticationService) =>
      (
        service as unknown as {
          getCurrentData: () => Promise<unknown>;
        }
      ).getCurrentData();

    it("should fetch the current data", async () => {
      const service = buildService();
      mocks.store.data = validConfig();

      await expect(get(service)).resolves.toEqual({ data: {} });

      expect(mocks.apiClient.get).toHaveBeenCalledWith("/", {
        headers: { Authorization: "Bearer tok" },
      });
    });

    it("should wrap an error raised while fetching the current data", async () => {
      const service = buildService();
      mocks.store.data = validConfig();
      const networkError = new Error("net");
      mocks.apiClient.get.mockRejectedValueOnce(networkError);

      await expect(get(service)).rejects.toEqual(
        expect.objectContaining({
          key: "@authentication_service_get_current_data/GET_CURRENT_DATA_FAILED",
          message: "Get current data failed. error",
          debug: expect.objectContaining({ error: networkError }),
        }),
      );
    });
  });
});
