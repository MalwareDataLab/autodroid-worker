import { randomUUID } from "node:crypto";
import util from "node:util";

// Config import
import { getEnvConfig } from "@config/env";

// Util import
import { logger } from "@shared/utils/logger";
import { sanitizeErrorObject } from "@shared/utils/sanitizeErrorObject.util";

interface IWorkerError {
  key: string;
  message: string;
  statusCode?: number;
  debug?: {
    [key: string]: any;
    disableRegister?: boolean;
  };
}

class WorkerError extends Error {
  public readonly name: string;
  public readonly message: string;

  public readonly key: string;

  public readonly handler: string;
  public readonly errorCode: string;
  public readonly statusCode: number;

  public readonly debug:
    | {
        [key: string]: any;
      }
    | undefined;

  public readonly action: Promise<void>;

  constructor(params: IWorkerError) {
    super(params.message);
    Object.setPrototypeOf(this, WorkerError.prototype);

    if (Error.captureStackTrace) Error.captureStackTrace(this, WorkerError);

    this.name = params.key;
    this.message = params.message;

    this.key = params.key;

    this.handler = this.constructor.name;
    this.errorCode = randomUUID();

    this.debug = params.debug
      ? {
          ...sanitizeErrorObject(params.debug || {}),
          error_code: this.errorCode,
        }
      : undefined;
    this.action = this.register();
  }

  private async register() {
    const envConfig = getEnvConfig();

    if (
      (!!this.debug || this.statusCode >= 500) &&
      !this.debug?.disableRegister &&
      !envConfig.isTestEnv
    ) {
      if (envConfig.DEBUG)
        logger.error(`❌ Error debug: ${util.inspect(this, false, 4, true)}`);
    }
  }

  static make(params: IWorkerError) {
    return new WorkerError(params);
  }
}

export { WorkerError };
