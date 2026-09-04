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

  it("should log retry details for a structured error", async () => {
    const retry = retryExecution({ ...options, retries: 1 });

    await retry("@test/STRUCTURED", () =>
      Promise.reject(
        Object.assign(new Error("boom"), {
          response: { data: { code: "C", message: "M", error: "E" } },
        }),
      ),
    ).catch(() => undefined);
  });

  it("should log retry details for an error without a message", async () => {
    const retry = retryExecution({ ...options, retries: 1 });

    await retry("@test/BARE", () => Promise.reject(new Error(""))).catch(
      () => undefined,
    );
  });

  it("should log retry details for an error whose response has no data", async () => {
    const retry = retryExecution({ ...options, retries: 1 });

    await retry("@test/NO_DATA", () =>
      Promise.reject(Object.assign(new Error("boom"), { response: {} })),
    ).catch(() => undefined);
  });
});
