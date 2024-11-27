import asyncRetry, { Options } from "async-retry";

const retryExecution =
  (options: Options) =>
  async <T>(fn: () => Promise<T>) => {
    return asyncRetry(fn, options);
  };

export { retryExecution };
