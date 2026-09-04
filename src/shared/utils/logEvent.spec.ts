import { beforeEach, describe, expect, it, vi } from "vitest";

// Config import
import { getEnvConfig } from "@config/env";

// Infrastructure import
import { Sentry } from "@shared/infrastructure/sentry";

// Test target import
import { logEvent } from "./logEvent";

vi.mock("@config/env", () => ({
  getEnvConfig: vi.fn(() => ({ NAME: "worker" })),
}));

describe("Utils: logEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should capture the event with data", () => {
    logEvent("event", { detail: 1 });

    expect(Sentry.captureEvent).toHaveBeenCalledWith({
      message: "event",
      extra: { detail: 1 },
      server_name: "worker",
    });
    expect(getEnvConfig).toHaveBeenCalled();
  });

  it("should capture the event without data", () => {
    logEvent("event");

    expect(Sentry.captureEvent).toHaveBeenCalledWith({
      message: "event",
      extra: undefined,
      server_name: "worker",
    });
  });
});
