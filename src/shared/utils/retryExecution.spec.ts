import { describe, expect, it, vi } from "vitest";

// Target import
import { retryExecution } from "./retryExecution.util";

const options = {
  retries: 5,
  factor: 2,
  minTimeout: 1,
  maxTimeout: 2,
  forever: false,
  maxRetryTime: 100,
  randomize: true,
};

describe("Util: retryExecution", () => {
  it("should retry execution", async () => {
    const retry = retryExecution(options);

    const fn = vi.fn();
    fn.mockImplementation(() => {
      if (fn.mock.calls.length < 5) throw new Error("Failed attempt");

      return "Success";
    });

    await retry("@test/RETRY", () => fn()).then(result => {
      expect(result).toBe("Success");
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });
});
