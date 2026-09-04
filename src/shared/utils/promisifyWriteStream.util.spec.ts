import { EventEmitter } from "node:events";
import { WriteStream } from "node:fs";
import { describe, expect, it } from "vitest";

// Test target import
import { promisifyWriteStream } from "./promisifyWriteStream.util";

describe("Utils: promisifyWriteStream", () => {
  it("should resolve when the stream finishes", async () => {
    const stream = new EventEmitter() as WriteStream;
    const promise = promisifyWriteStream(stream);

    stream.emit("finish");

    await expect(promise).resolves.toBeUndefined();
  });

  it("should reject when the stream errors", async () => {
    const stream = new EventEmitter() as WriteStream;
    const promise = promisifyWriteStream(stream);
    const error = new Error("boom");

    stream.emit("error", error);

    await expect(promise).rejects.toBe(error);
  });
});
