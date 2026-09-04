import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Test target import
import { getErrorMessage } from "./getErrorMessage.util";

describe("Utils: getErrorMessage", () => {
  it("should format a WorkerError", () => {
    const error = new WorkerError({ key: "@test/KEY", message: "boom" });

    expect(getErrorMessage(error)).toBe("[@test/KEY]: boom");
  });

  it("should format an AxiosError with a response status and body message", () => {
    const error = new AxiosError("request failed");
    error.config = {
      method: "get",
      baseURL: "http://api",
      url: "/data",
    } as never;
    error.response = {
      status: 500,
      data: { message: "server error" },
    } as never;

    expect(getErrorMessage(error)).toBe(
      "[get http://api/data 500] server error",
    );
  });

  it("should fall back to the AxiosError message when there is no response", () => {
    const error = new AxiosError("request failed");
    error.config = {
      method: "get",
      baseURL: "http://api",
      url: "/data",
    } as never;

    expect(getErrorMessage(error)).toBe("[get http://api/data] request failed");
  });

  it("should tolerate an AxiosError without any message", () => {
    const error = new AxiosError("");
    error.config = {
      method: "get",
      baseURL: "http://api",
      url: "/data",
    } as never;

    expect(getErrorMessage(error)).toBe("[get http://api/data] ");
  });

  it("should return the message of a plain error", () => {
    expect(getErrorMessage({ message: "plain" })).toBe("plain");
  });

  it("should return an empty string when there is no message", () => {
    expect(getErrorMessage({})).toBe("");
  });
});
