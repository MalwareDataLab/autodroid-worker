import { getEnvConfig } from "./env";

interface IApiConfig {
  baseUrl: string;
}

const getApiConfig = (): IApiConfig => {
  const envConfig = getEnvConfig();

  return {
    baseUrl: envConfig.API_BASE_URL,
  };
};

export type { IApiConfig };
export { getApiConfig };
