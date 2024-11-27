import asyncRetry, { Options } from "async-retry";

// Util import
import { logger } from "./logger";

const retryExecution =
  (
    options: Options = {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 1000 * 60 * 5, // 5 minutes
      forever: false,
      randomize: true,
      onRetry(e: any, attempt) {
        logger.error(
          `🔃 Retrying ${attempt} attempt due to an error. ${e?.message || ""}`,
        );
      },
    },
  ) =>
  async <T>(fn: () => Promise<T>) => {
    return asyncRetry(fn, options);
  };

export { retryExecution };
