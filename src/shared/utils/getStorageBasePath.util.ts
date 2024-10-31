import path from "node:path";
import os from "node:os";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { getSystemEnvironment } from "./getSystemEnvironment.util";

export const getStorageBaseFolder = (dir: string) => {
  const envConfig = getEnvConfig();
  return path.join(envConfig.APP_INFO.name, dir);
};

export const getStorageBasePath = (dir: string) => {
  const environment = getSystemEnvironment();

  const selectedDir = getStorageBaseFolder(dir);

  switch (environment) {
    case "development":
      return path.join(process.cwd(), "temp", selectedDir);
    case "container":
      return path.join(process.cwd(), "temp", selectedDir);
    case "linux":
      return path.join(os.homedir(), ".config", selectedDir);
    case "windows":
      return path.join(process.env.APPDATA || "", selectedDir);
    case "macos":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        selectedDir,
      );
    default:
      throw new WorkerError({
        key: "@get_storage_bash_path/UNKNOWN_PLATFORM",
        message: "Unknown environment for configuration file path.",
      });
  }
};
