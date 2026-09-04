import { describe, expect, it, vi } from "vitest";

// Test target import
import "./logger";

const state = vi.hoisted(() => ({ printfCallback: undefined as unknown }));

vi.mock("winston", () => ({
  createLogger: vi.fn(() => ({})),
  format: {
    printf: vi.fn((callback: unknown) => {
      state.printfCallback = callback;
      return {};
    }),
    combine: vi.fn(() => ({})),
    colorize: vi.fn(() => ({})),
    timestamp: vi.fn(() => ({})),
    errors: vi.fn(() => ({})),
  },
  transports: { Console: vi.fn() },
}));

vi.mock("@config/env", () => ({
  getEnvConfig: () => ({ isTestEnv: true }),
}));

describe("Utils: logger", () => {
  it("should format a log entry with timestamp, level and message", () => {
    const format = state.printfCallback as (entry: {
      timestamp: string;
      level: string;
      message: string;
    }) => string;

    expect(format({ timestamp: "2024", level: "info", message: "hello" })).toBe(
      "[2024] [info] hello",
    );
  });
});
