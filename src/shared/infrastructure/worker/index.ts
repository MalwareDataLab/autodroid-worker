import { WorkerError } from "@shared/errors/WorkerError";
import { AppConfig } from "@shared/types/appConfig.type";

// Service import
import { AuthenticationService } from "@modules/authentication/services/authentication.service";
import { ProcessingService } from "@modules/processing/services/processing.service";

// Infrastructure import
import { WebSocketApp } from "@shared/infrastructure/websocket";
import { Api } from "@shared/infrastructure/api";

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
      console.log(
        `❌ Fail to initialize worker. Shutting down. ${error.message}`,
      );
      process.exit(1);
    }
  }
}

export { Worker };
