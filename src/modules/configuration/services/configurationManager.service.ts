import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Util import
import { sleep } from "@shared/utils/sleep.util";
import { logger } from "@shared/utils/logger";
import { getStorageBasePath } from "@shared/utils/getStorageBasePath.util";

// Config import
import { defaultConfiguration } from "../constants/defaultConfiguration";

// Enum import
import { CONFIGURATION } from "../types/configuration.enum";

// Type import
import { ConfigurationData } from "../types/configurationData.type";

export class ConfigurationManagerService<
  T extends CONFIGURATION | string,
  D = T extends CONFIGURATION ? ConfigurationData<T> : Record<string, any>,
> {
  private readonly configurationKey: CONFIGURATION | string;

  private readonly filename: string;
  private readonly path: string;

  private readonly defaultConfiguration: D | null;

  private config: D;

  constructor(configurationKey: T) {
    this.configurationKey = configurationKey;
    this.defaultConfiguration =
      configurationKey in defaultConfiguration
        ? (defaultConfiguration[
            configurationKey as keyof typeof defaultConfiguration
          ] as D)
        : null;

    this.filename = `${this.configurationKey}.json`;
    this.path = this.getConfigFilePath();

    this.config = this.loadConfig();
  }

  private getConfigFilePath(): string {
    return path.join(getStorageBasePath(this.filename));
  }

  private sanitizeData(data: D): D {
    if (this.defaultConfiguration)
      return Object.entries(
        this.defaultConfiguration as Record<string, any>,
      ).reduce(
        (acc, [key, defaultValue]) => {
          acc[key] = (data as Record<string, any>)[key] ?? defaultValue;
          return acc;
        },
        {} as Record<string, any>,
      ) as D;
    return data;
  }

  private setupInitialData() {
    this.saveConfigSync(this.defaultConfiguration || ({} as D));
    return this.defaultConfiguration;
  }

  private loadConfig(): D {
    if (!fsSync.existsSync(this.path)) {
      if (Object.keys(CONFIGURATION).includes(this.configurationKey))
        logger.warn(
          `Config file not found, creating a new one at ${this.path}`,
        );
      this.setupInitialData();
    }

    try {
      const fileContent = fsSync.readFileSync(this.path, "utf-8");
      return this.sanitizeData(JSON.parse(fileContent));
    } catch (error) {
      throw new WorkerError({
        key: "@configuration_manager_service_load_config/CONFIG_FILE_READ_ERROR",
        message: `Error reading config file: ${error}`,
      });
    }
  }

  private saveConfigSync(data: D): void {
    const content = this.sanitizeData(data);
    this.config = content;
    const dirPath = path.dirname(this.path);
    if (!fsSync.existsSync(dirPath))
      fsSync.mkdirSync(dirPath, { recursive: true });
    fsSync.writeFileSync(this.path, JSON.stringify(content, null, 2));
  }

  private async saveConfig(data: D): Promise<void> {
    const content = this.sanitizeData(data);
    this.config = content;
    const dirPath = path.dirname(this.path);
    if (!fsSync.existsSync(dirPath))
      await fsPromises.mkdir(dirPath, { recursive: true });
    await fsPromises.writeFile(this.path, JSON.stringify(content, null, 2));
    await sleep(100);
  }

  public deleteConfig() {
    try {
      fsSync.unlinkSync(this.path);
    } catch (error) {
      throw new WorkerError({
        key: "@configuration_manager_service_reset_config_file/CONFIG_FILE_DELETE_ERROR",
        message: `Error deleting config file: ${error}`,
      });
    }
  }

  public resetConfig() {
    this.deleteConfig();
    this.setupInitialData();
  }

  public getConfig(): D {
    return this.config;
  }

  public async setConfig(data: Partial<D>): Promise<void> {
    const result = { ...this.config, ...data };
    this.config = result;
    await this.saveConfig(result);
  }

  public getConfigValue<K extends keyof D>(key: K): D[K] {
    return this.config[key];
  }

  public async setConfigValue<K extends keyof D>(
    key: K,
    value: D[K],
  ): Promise<void> {
    this.config[key] = value;
    await this.saveConfig(this.config);
  }
}
