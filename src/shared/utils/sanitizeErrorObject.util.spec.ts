import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Util import
import { sanitizeAxiosError } from "./sanitizeAxiosError.util";

// Test target import
import { sanitizeErrorObject } from "./sanitizeErrorObject.util";

vi.mock("./sanitizeAxiosError.util", () => ({ sanitizeAxiosError: vi.fn() }));

describe("Utils: sanitizeErrorObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the value unchanged when it is falsy", () => {
    expect(sanitizeErrorObject(null)).toBeNull();
  });

  it("should return the value unchanged when it has no keys", () => {
    const error = {};

    expect(sanitizeErrorObject(error)).toBe(error);
  });

  it("should replace sanitized entries and keep the rest", () => {
    const axiosValue = { axios: true };
    const plainValue = { plain: true };

    (sanitizeAxiosError as Mock).mockImplementation(value =>
      value === axiosValue ? { sanitized: true } : null,
    );

    expect(sanitizeErrorObject({ a: axiosValue, b: plainValue })).toEqual({
      a: { sanitized: true },
      b: plainValue,
    });
  });
});
