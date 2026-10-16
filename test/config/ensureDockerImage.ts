import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ensureDockerImage = async (image: string) => {
  try {
    await execFileAsync("docker", ["image", "inspect", image]);
  } catch {
    await execFileAsync("docker", ["pull", image]);
  }
};
