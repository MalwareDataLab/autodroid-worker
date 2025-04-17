/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
      DEBUG: boolean;

      API_BASE_URL: string;
      NAME: string;
      REGISTRATION_TOKEN: string;

      WORKER_ID: string;
    }
  }
}

export {};
