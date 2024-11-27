import axios, { AxiosInstance } from "axios";

// Config import
import { getApiConfig, IApiConfig } from "@config/api";

// Util import
import { logger } from "@shared/utils/logger";
import { retryExecution } from "@shared/utils/retryExecution.util";

// Type import
import { AppContext } from "@shared/types/appContext.type";

const retry = retryExecution();

class Api {
  private readonly context: AppContext;

  public readonly client: AxiosInstance;
  public readonly config: IApiConfig;

  constructor({ context }: { context: AppContext }) {
    this.context = context;

    this.config = getApiConfig();
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use(async config => {
      try {
        await retry(async () => {
          const auth = await this.context.authentication.refreshAuthentication({
            forceAccessTokenUpdate: true,
          });

          Object.assign(config.headers, {
            Authorization: `Bearer ${auth.access_token}`,
          });
        });
      } catch (error) {
        logger.error(
          `❌ Error while refreshing access token during calls to API. Unable to continue. ${error}`,
        );
        process.exit(1);
      }

      return config;
    });
  }
}

export { Api };
