import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Tests that talk to a real Docker daemon assume their base image is already
// present locally. Pull it on demand so a fresh host runs green on the first
// try instead of failing with `No such image`.
export const ensureDockerImage = async (image: string) => {
  try {
    await execFileAsync("docker", ["image", "inspect", image]);
  } catch {
    await execFileAsync("docker", ["pull", image]);
  }
};
