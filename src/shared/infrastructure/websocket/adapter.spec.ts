import { describe, expect, it } from "vitest";

// Type import
import { WebsocketClient } from "./types";

// Test target import
import { WebsocketAdapter } from "./adapter";

describe("Infrastructure: WebsocketAdapter", () => {
  it("should resolve the client once it is initialized", async () => {
    const client = { connected: true } as unknown as WebsocketClient;

    const pending = WebsocketAdapter.getClient();
    WebsocketAdapter.initialize(client);

    await expect(pending).resolves.toBe(client);
    await expect(WebsocketAdapter.getClient()).resolves.toBe(client);
  });
});
