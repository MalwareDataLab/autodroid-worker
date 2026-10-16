import { afterEach, describe, expect, it, vi } from "vitest";

// Target import
import { sleep } from "./sleep.util";

describe("Utils: sleep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve only after the given delay elapses", async () => {
    vi.useFakeTimers();

    const resolved = vi.fn();
    sleep(1000).then(resolved);

    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(resolved).toHaveBeenCalledOnce();
  });
});
