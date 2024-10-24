import axios, { AxiosInstance } from "axios";

// Config import
import { getApiConfig, IApiConfig } from "@config/api";

// Type import
import { AppContext } from "@shared/types/appContext.type";

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
      const auth = await this.context.authentication.handleAuthentication();

      Object.assign(config.headers, {
        Authorization: `Bearer ${auth.access_token}`,
      });

      return config;
    });
  }
}

export { Api };
