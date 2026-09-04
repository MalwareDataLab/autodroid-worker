import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Target import
import { calculateFileMD5 } from "./calculateFileMD5.util";

describe("Integration: calculateFileMD5 against the filesystem", () => {
  let workingDirectory: string;

  beforeAll(async () => {
    workingDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "autodroid-worker-md5-"),
    );
  });

  afterAll(async () => {
    await fs.rm(workingDirectory, { recursive: true, force: true });
  });

  it("should hash a real file to its known digest", async () => {
    const filePath = path.join(workingDirectory, "hello.txt");
    await fs.writeFile(filePath, "hello");

    await expect(calculateFileMD5(filePath)).resolves.toBe(
      "5d41402abc4b2a76b9719d911017c592",
    );
  });

  it("should hash an empty file to the empty digest", async () => {
    const filePath = path.join(workingDirectory, "empty.txt");
    await fs.writeFile(filePath, "");

    await expect(calculateFileMD5(filePath)).resolves.toBe(
      "d41d8cd98f00b204e9800998ecf8427e",
    );
  });

  it("should hash a file larger than a single stream chunk", async () => {
    const filePath = path.join(workingDirectory, "large.bin");
    const contents = "a".repeat(256 * 1024);
    await fs.writeFile(filePath, contents);

    await expect(calculateFileMD5(filePath)).resolves.toBe(
      "c946b71bb69c07daf25470742c967e7c",
    );
  });

  it("should reject when the file is not on disk", async () => {
    await expect(
      calculateFileMD5(path.join(workingDirectory, "absent.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
