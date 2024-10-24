import path from "node:path";
import os from "node:os";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { getSystemEnvironment } from "./getSystemEnvironment.util";

export const getStorageBasePath = (dir: string) => {
  const environment = getSystemEnvironment();
  const envConfig = getEnvConfig();
  const selectedDir = path.join(envConfig.APP_INFO.name, dir);
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
        key: "@configuration_manager_service_get_config_file_path/UNKNOWN_PLATFORM",
        message: "Unknown environment for configuration file path.",
      });
  }
};
