import { getEnvConfig } from "./env";

interface IApiConfig {
  baseUrl: string;
}

const getApiConfig = (): IApiConfig => {
  const envConfig = getEnvConfig();

  if (envConfig.NODE_ENV === "development")
    return { baseUrl: "http://localhost:3333" };

  return {
    baseUrl: envConfig.API_BASE_URL || "https://autodroid-api.laviola.dev",
  };
};

export type { IApiConfig };
export { getApiConfig };
