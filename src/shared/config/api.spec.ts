import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Config import
import { getEnvConfig } from "./env";

// Test target import
import { getApiConfig } from "./api";

vi.mock("./env", () => ({ getEnvConfig: vi.fn() }));

describe("Config: getApiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose the api base url taken from the environment", () => {
    (getEnvConfig as Mock).mockReturnValue({
      API_BASE_URL: "http://api",
      NAME: "worker",
    });

    expect(getApiConfig()).toEqual({ baseUrl: "http://api" });
  });
});
