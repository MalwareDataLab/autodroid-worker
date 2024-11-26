import fsSync from "node:fs";
import os from "node:os";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Config import
import { getEnvConfig } from "@config/env";

const getSystemEnvironment = () => {
  const env = getEnvConfig();

  if (env.isTestEnv) return "test";
  if (fsSync.existsSync("/.dockerenv")) return "container";
  if (env.NODE_ENV === "development") return "development";

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
