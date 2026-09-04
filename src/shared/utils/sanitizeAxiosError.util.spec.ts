import axios from "axios";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Test target import
import { sanitizeAxiosError } from "./sanitizeAxiosError.util";

vi.mock("axios", () => ({ default: { isAxiosError: vi.fn() } }));

describe("Utils: sanitizeAxiosError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when the error is not an axios error", () => {
    (axios.isAxiosError as unknown as Mock).mockReturnValue(false);

    expect(sanitizeAxiosError(new Error("plain"))).toBeNull();
  });

  it("should sanitize a full axios error", () => {
    (axios.isAxiosError as unknown as Mock).mockReturnValue(true);

    const error = {
      message: "failed",
      response: {
        status: 500,
        statusText: "Internal",
        headers: { a: "1" },
        data: { error: "x" },
      },
      request: {
        path: "/path",
        getHeaders: () => ({ b: "2" }),
        method: "GET",
      },
      config: { url: "/url", method: "get", headers: { c: "3" }, data: "body" },
    };

    expect(sanitizeAxiosError(error)).toEqual({
      message: "failed",
      response: {
        status: 500,
        statusText: "Internal",
        headers: { a: "1" },
        data: { error: "x" },
      },
      request: { path: "/path", headers: { b: "2" }, method: "GET" },
      config: { url: "/url", method: "get", headers: { c: "3" }, data: "body" },
    });
  });

  it("should sanitize an axios error without response, config or request headers", () => {
    (axios.isAxiosError as unknown as Mock).mockReturnValue(true);

    const error = {
      message: "failed",
      response: undefined,
      request: { path: "/path", method: "GET" },
      config: undefined,
    };

    expect(sanitizeAxiosError(error)).toEqual({
      message: "failed",
      response: undefined,
      request: { path: "/path", headers: undefined, method: "GET" },
      config: {
        url: undefined,
        method: undefined,
        headers: undefined,
        data: undefined,
      },
    });
  });

  it("should sanitize an axios error without a request", () => {
    (axios.isAxiosError as unknown as Mock).mockReturnValue(true);

    const error = {
      message: "failed",
      response: undefined,
      request: undefined,
      config: undefined,
    };

    expect(sanitizeAxiosError(error)).toEqual({
      message: "failed",
      response: undefined,
      request: undefined,
      config: {
        url: undefined,
        method: undefined,
        headers: undefined,
        data: undefined,
      },
    });
  });
});
