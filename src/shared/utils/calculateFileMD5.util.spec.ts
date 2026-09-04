import { EventEmitter } from "node:events";
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Test target import
import { calculateFileMD5 } from "./calculateFileMD5.util";

vi.mock("node:fs", () => ({ default: { createReadStream: vi.fn() } }));

describe("Utils: calculateFileMD5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve the md5 hash of the streamed content", async () => {
    const stream = new EventEmitter();
    vi.mocked(fs.createReadStream).mockReturnValue(stream as never);

    const promise = calculateFileMD5("/file.bin");
    stream.emit("data", Buffer.from("hello"));
    stream.emit("end");

    await expect(promise).resolves.toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("should reject when the stream errors", async () => {
    const stream = new EventEmitter();
    vi.mocked(fs.createReadStream).mockReturnValue(stream as never);
    const error = new Error("read failed");

    const promise = calculateFileMD5("/file.bin");
    stream.emit("error", error);

    await expect(promise).rejects.toBe(error);
  });
});
