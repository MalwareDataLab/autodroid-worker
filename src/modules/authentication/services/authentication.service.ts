import { randomUUID, createHash } from "node:crypto";
import { isHash, isJWT, isUUID } from "validator";
import axios, { Axios } from "axios";

// Config import
import { getApiConfig } from "@config/api";
import { getEnvConfig } from "@config/env";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Enum import
import { CONFIGURATION } from "@modules/configuration/types/configuration.enum";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";

// Util import
import { logger } from "@shared/utils/logger";
import { DateHelpers } from "@shared/utils/dateHelper.util";
import { executeAction } from "@shared/utils/executeAction.util";
import { retryExecution } from "@shared/utils/retryExecution.util";
import { getErrorMessage } from "@shared/utils/getErrorMessage.util";
import { getSystemStaticInfo } from "@shared/utils/getSystemStaticInfo.util";

// Type import
import type { AppContext } from "@shared/types/appContext.type";

const retry = retryExecution();

class AuthenticationService {
  public readonly initialization: Promise<void>;

  private config: ConfigurationManagerService<CONFIGURATION.AUTHENTICATION>;
  private apiClient: Axios;

  constructor(
    private params: {
      name: string;
      registration_token?: string | null;
      context: AppContext;
    },
  ) {
    const apiConfig = getApiConfig();

    this.config = new ConfigurationManagerService(CONFIGURATION.AUTHENTICATION);

    if (
      !this.config.getConfig().registration_token &&
      !this.params.registration_token
    )
      throw new WorkerError({
        key: "@authentication_service_init/MISSING_REGISTRATION_TOKEN",
        message: "Registration token is missing.",
      });

    this.apiClient = axios.create({
      baseURL: `${apiConfig.baseUrl}/worker`,
    });

    this.initialization = executeAction({
      action: ({ attempt }) => this.init(attempt),
      actionName: "Authentication initialization",
      retryDelay: 1 * 1000,
      maxRetries: 5,
      logging: true,
    });
  }

  private async init(attempt = 1) {
    const { version } = getEnvConfig().APP_INFO;

    await this.config.setConfigValue("name", this.params.name);
    await this.handleInternalId();
    await this.handleSignature();
    await this.refreshAuthentication({
      forceAccessTokenUpdate: true,
      forceRegistration: attempt >= 5,
    });

    logger.info(`🆗 Worker v${version} id ${this.getConfig().worker_id}`);
  }

  public getConfig() {
    return this.config.getConfig();
  }

  public async refreshAuthentication(
    params: {
      forceRefreshTokenUpdate?: boolean;
      forceAccessTokenUpdate?: boolean;
      forceRegistration?: boolean;
    } = {},
  ) {
    const config = this.getConfig();

    if (
      !config.registration_token ||
      !config.refresh_token ||
      params.forceRegistration ||
      (!!this.params.registration_token &&
        config.registration_token !== this.params.registration_token)
    )
      await this.registerAndSetSession();

    if (this.refreshTokenNeedsRefresh() || params.forceRefreshTokenUpdate)
      await this.updateRefreshToken();

    if (
      this.accessTokenNeedsRefresh() ||
      params.forceRefreshTokenUpdate ||
      params.forceAccessTokenUpdate
    )
      await this.updateAccessToken();

    await this.getCurrentData();

    return this.getConfig();
  }

  private async getCurrentData() {
    try {
      const data = await retry("@authentication/GET_CURRENT_DATA", () =>
        this.apiClient.get("/", {
          headers: {
            Authorization: `Bearer ${this.getConfig().access_token}`,
          },
        }),
      );

      return data;
    } catch (error) {
      throw new WorkerError({
        key: "@authentication_service_get_current_data/GET_CURRENT_DATA_FAILED",
        message: `Get current data failed. ${getErrorMessage(error)}`,
        debug: { error },
      });
    }
  }

  private validateRequiredConfigurationData() {
    const config = this.getConfig();

    if (!config.name || typeof config.name !== "string")
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_NAME",
        message: "Name is missing.",
      });

    if (!config.registration_token)
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_REGISTRATION_TOKEN",
        message: "Registration token is missing.",
      });

    if (!config.signature || !isHash(config.signature, "sha256"))
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_SIGNATURE",
        message: "Signature is missing.",
      });

    if (!config.internal_id || !isUUID(config.internal_id))
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_INTERNAL_ID",
        message: "Internal id is missing.",
      });

    if (!config.worker_id || !isUUID(config.worker_id))
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_WORKER_ID",
        message: "Worker id is missing.",
      });

    if (!config.refresh_token || !isJWT(config.refresh_token))
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN",
        message: "Refresh token is missing.",
      });

    if (
      !config.refresh_token_expires_at ||
      typeof config.refresh_token_expires_at !== "string"
    )
      throw new WorkerError({
        key: "@authentication_service_validate_required_configuration_data/MISSING_REFRESH_TOKEN_EXPIRES_AT",
        message: "Refresh token expires at is missing.",
      });
  }

  private async getRequiredConfigurationData() {
    const {
      name,
      registration_token,
      internal_id,
      signature,
      worker_id,
      refresh_token,
    } = this.getConfig();

    const system_info = await getSystemStaticInfo();

    return {
      name,
      system_info,
      registration_token,
      internal_id,
      signature,
      worker_id,
      refresh_token,
    };
  }

  private async validateAndGetRequiredConfigurationData() {
    this.validateRequiredConfigurationData();

    const data = await this.getRequiredConfigurationData();
    return data;
  }

  private async handleInternalId() {
    const { internal_id } = this.getConfig();

    if (
      !internal_id ||
      typeof internal_id !== "string" ||
      !isUUID(internal_id)
    ) {
      await this.config.setConfigValue("internal_id", randomUUID());
    }
  }

  private async createSignature() {
    const systemStaticInfo = await getSystemStaticInfo();
    const { internal_id } = this.getConfig();

    if (!internal_id || !isUUID(internal_id))
      throw new WorkerError({
        key: "@authentication_service_create_signature/MISSING_INTERNAL_ID",
        message: "Internal id is missing.",
      });

    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          ...systemStaticInfo,
          internalId: internal_id,
        }),
      )
      .digest("hex");

    return signature;
  }

  private async handleSignature() {
    const { signature } = this.getConfig();

    if (
      !signature ||
      typeof signature !== "string" ||
      !isHash(signature, "sha256")
    ) {
      const createdSignature = await this.createSignature();
      await this.config.setConfigValue("signature", createdSignature);
    }
  }

  private async registerAndSetSession() {
    const config = this.getConfig();

    const registration_token =
      this.params.registration_token || config.registration_token;

    if (!registration_token)
      throw new WorkerError({
        key: "@authentication_service_register/MISSING_REGISTRATION_TOKEN",
        message: "Registration token is missing.",
      });

    await this.config.setConfigValue("registration_token", registration_token);

    try {
      const system_info = await getSystemStaticInfo();
      const { data } = await this.apiClient.post("/register", {
        name: this.params.name,
        registration_token,
        internal_id: config.internal_id,
        signature: config.signature,
        system_info,
      });

      await this.config.setConfig({
        name: this.params.name,
        worker_id: data.id,
        refresh_token: data.refresh_token,
        refresh_token_expires_at: data.refresh_token_expires_at,
      });
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError({
        key: "@authentication_service_register/REGISTRATION_FAILED",
        message: `Registration failed. ${getErrorMessage(error)}`,
        debug: {
          error,
        },
      });
    }
  }

  private async updateRefreshToken() {
    const params = await this.validateAndGetRequiredConfigurationData();

    try {
      const { data } = await this.apiClient.post("/refresh-token", params);

      await this.config.setConfig({
        worker_id: data.id,
        refresh_token: data.refresh_token,
        refresh_token_expires_at: data.refresh_token_expires_at,
      });
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError({
        key: "@authentication_service_get_refresh_token/GET_REFRESH_TOKEN_FAILED",
        message: `Get refresh token failed. ${getErrorMessage(error)}`,
        debug: {
          error,
        },
      });
    }
  }

  private async updateAccessToken() {
    const params = await this.validateAndGetRequiredConfigurationData();

    try {
      const { data } = await retry("@authentication/UPDATE_ACCESS_TOKEN", () =>
        this.apiClient.post("/access-token", params),
      );

      await this.config.setConfig({
        access_token: data.access_token,
        access_token_expires_at: data.access_token_expires_at,
      });
    } catch (error) {
      if (error instanceof WorkerError) throw error;
      throw new WorkerError({
        key: "@authentication_service_get_access_token/GET_ACCESS_TOKEN_FAILED",
        message: `Get access token failed. ${getErrorMessage(error)}`,
        debug: {
          error,
        },
      });
    }
  }

  private getAccessTokenExpirationDate() {
    const { access_token_expires_at } = this.getConfig();

    if (!access_token_expires_at || typeof access_token_expires_at !== "string")
      throw new WorkerError({
        key: "@authentication_service_get_access_token_expiration_date/MISSING_ACCESS_TOKEN_EXPIRATION_DATE",
        message: "Access token expiration date is missing.",
        debug: { access_token_expires_at },
      });

    const date = DateHelpers.parseISOString(access_token_expires_at);

    if (!date.isValid())
      throw new WorkerError({
        key: "@authentication_service_get_access_token_expiration_date/INVALID_ACCESS_TOKEN_EXPIRATION_DATE",
        message: "Invalid access token expiration date.",
        debug: { access_token_expires_at },
      });

    return date.toDate();
  }

  private getRefreshTokenExpirationDate() {
    const { refresh_token_expires_at } = this.getConfig();

    if (
      !refresh_token_expires_at ||
      typeof refresh_token_expires_at !== "string"
    )
      throw new WorkerError({
        key: "@authentication_service_get_refresh_token_expiration_date/MISSING_REFRESH_TOKEN_EXPIRATION_DATE",
        message: "Refresh token expiration date is missing.",
        debug: { refresh_token_expires_at },
      });

    const date = DateHelpers.parseISOString(refresh_token_expires_at);

    if (!date.isValid())
      throw new WorkerError({
        key: "@authentication_service_get_refresh_token_expiration_date/INVALID_REFRESH_TOKEN_EXPIRATION_DATE",
        message: "Invalid refresh token expiration date.",
        debug: { refresh_token_expires_at },
      });

    return date.toDate();
  }

  private accessTokenNeedsRefresh() {
    const { access_token, access_token_expires_at } = this.getConfig();

    if (
      !access_token ||
      typeof access_token !== "string" ||
      !access_token_expires_at ||
      typeof access_token_expires_at !== "string"
    )
      return true;

    const access_token_expiration = DateHelpers.parse(
      this.getAccessTokenExpirationDate(),
    );

    return access_token_expiration
      .subtract(1, "hour")
      .isBefore(DateHelpers.now());
  }

  private refreshTokenNeedsRefresh() {
    const refresh_token_expiration = DateHelpers.parse(
      this.getRefreshTokenExpirationDate(),
    );

    return refresh_token_expiration
      .subtract(1, "day")
      .isBefore(DateHelpers.now());
  }
}

export { AuthenticationService };
