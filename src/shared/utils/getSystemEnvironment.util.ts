import fsSync from "node:fs";
import os from "node:os";

import { getEnvConfig } from "@config/env";
import { WorkerError } from "@shared/errors/WorkerError";

const getSystemEnvironment = () => {
  const env = getEnvConfig();

  if (env.isTestEnv) return "test";
  if (env.NODE_ENV === "development") return "development";
  if (fsSync.existsSync("/.dockerenv")) return "container";

  const platform = os.platform();

  if (platform === "linux") return "linux";
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";

  throw new WorkerError({
    key: "@configuration_manager_service_get_environment/UNKNOWN_PLATFORM",
    message: "Unknown environment.",
  });
};

export { getSystemEnvironment };
