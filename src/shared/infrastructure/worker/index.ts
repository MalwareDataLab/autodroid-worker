// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Type import
import { AppConfig } from "@shared/types/appConfig.type";

// Util import
import { logger } from "@shared/utils/logger";

// Service import
import { ProcessingService } from "@modules/processing/services/processing.service";
import { AuthenticationService } from "@modules/authentication/services/authentication.service";

// Infrastructure import
import { Api } from "@shared/infrastructure/api";
import { WebSocketApp } from "@shared/infrastructure/websocket";

class Worker {
  public readonly initialization: Promise<void>;

  public readonly authentication: AuthenticationService;
  public readonly api: Api;

  public readonly webSocketClient: WebSocketApp;

  public readonly processing: ProcessingService;

  constructor(config: AppConfig) {
    this.authentication = new AuthenticationService({
      registration_token: config.registration_token,
      context: this,
    });

    this.api = new Api({ context: this });
    this.webSocketClient = new WebSocketApp({ context: this });
    this.processing = new ProcessingService({ context: this });
    this.initialization = this.init();
  }

  private async init() {
    try {
      await this.authentication.initialization;
      await this.webSocketClient.init();
      await this.processing.init();
    } catch (error: any) {
      WorkerError.make({
        key: "@worker/INIT_ERROR",
        message: "Worker initialization error",
        debug: {
          error,
        },
      });
      logger.error(
        `❌ Fail to initialize worker. Shutting down. ${error.message}`,
      );
      process.exit(1);
    }
  }
}

export { Worker };
