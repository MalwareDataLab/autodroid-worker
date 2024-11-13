import APP_INFO from "@/package.json";

const getEnvConfig = () =>
  ({
    ...process.env,

    isTestEnv: process.env.NODE_ENV?.toLowerCase() === "test",

    DEBUG: String(process.env.DEBUG) === "true",

    APP_INFO,
  }) as NodeJS.ProcessEnv & {
    APP_INFO: typeof APP_INFO;
    isTestEnv: boolean;
  };

export { getEnvConfig };
