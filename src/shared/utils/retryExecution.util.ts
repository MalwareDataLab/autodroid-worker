import asyncRetry, { Options } from "async-retry";

// Util import
import { logger } from "./logger";

const retryExecution =
  (overrides?: Options) =>
  async <T>(name: string, fn: () => Promise<T>) =>
    asyncRetry(fn, {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 1000 * 60 * 3, // 3 minutes
      forever: false,
      randomize: true,
      ...overrides,
      onRetry(e: any, attempt) {
        logger.error(
          `🔃 Retrying ${name} ${attempt} attempt due to an error. ${e?.message || ""} ${e?.response?.data?.code || "(no code)"} ${e?.response?.data?.message || "(no message)"} ${e?.response?.data?.error || "(no error context)"}`,
        );
      },
    });

export { retryExecution };
