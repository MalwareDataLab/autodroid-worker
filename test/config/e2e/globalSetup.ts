import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  E2E_TOOL_BUILD_CONTEXT,
  E2E_TOOL_IMAGE,
} from "@/test/fixtures/e2e-tool/image";

const execFileAsync = promisify(execFile);

const ensureBusyboxImage = async () => {
  try {
    await execFileAsync("docker", ["image", "inspect", "busybox:latest"]);
  } catch {
    await execFileAsync("docker", ["pull", "busybox:latest"]);
  }
};

// e2e drives ProcessingService's real pipeline against a real Docker daemon,
// so the fixture tool image it runs containers from must exist before any
// test file does. `docker build` is idempotent and content-addressed, so
// running it unconditionally on every run never risks a stale image.
// eslint-disable-next-line import/no-default-export
export default async function setup() {
  await ensureBusyboxImage();
  await execFileAsync("docker", [
    "build",
    "-t",
    E2E_TOOL_IMAGE,
    E2E_TOOL_BUILD_CONTEXT,
  ]);
}
