import { io } from "socket.io-client";

// Util import
import { logger } from "@shared/utils/logger";
import { executeAction } from "@shared/utils/executeAction.util";

// Type import
import { AppContext } from "@shared/types/appContext.type";
import { WebsocketClient } from "./types";

class WebSocketApp {
  public socket: WebsocketClient;
  private context: AppContext;

  constructor({ context }: { context: AppContext }) {
    this.context = context;
    this.socket = io(context.api.config.baseUrl, {
      path: "/websocket",

      auth: getAuthToken => {
        const auth = context.authentication.getConfig();
        if (!auth.access_token) throw new Error("Access token is required");

        getAuthToken({
          kind: "WORKER",
          token: `Bearer ${auth.access_token}`,
        });
      },

      autoConnect: false,

      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    this.startCommonListeners();
  }

  public async init(): Promise<void> {
    if (!this.socket.connected)
      await executeAction({
        action: () => this.connect(),
        actionName: "Websocket connection initialization",
        retryDelay: 1 * 1000,
        maxRetries: 5,
        logging: true,
      });
  }

  private async handleConnectionError(): Promise<void> {
    try {
      await this.context.authentication.refreshAuthentication({
        forceAccessTokenUpdate: true,
      });
      await this.init();
    } catch (error) {
      logger.error(
        `❌ Error while refreshing access token during websocket connection opening. Unable to continue ${error}`,
      );
      process.exit(1);
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const stopListeners = () => {
        // eslint-disable-next-line no-use-before-define
        this.socket.off("connect_error", onError);
        // eslint-disable-next-line no-use-before-define
        this.socket.off("connect", onSuccess);
      };

      const onSuccess = () => {
        stopListeners();
        resolve();
      };

      const onError = (error: any) => {
        stopListeners();
        this.disconnect();
        reject(error);
      };

      try {
        this.socket.connect();
        this.socket.once("connect_error", onError);
        this.socket.once("connect", onSuccess);
      } catch (error) {
        stopListeners();
        this.disconnect();
        reject(error);
      }
    });
  }

  public disconnect(): void {
    this.socket.disconnect();
  }

  private startCommonListeners(): void {
    this.socket.on("connect", () => {
      logger.info("✅ Connected to server");
    });

    this.socket.on("disconnect", () => {
      logger.info("⭕ Disconnected from server");
    });

    this.socket.io.on("error", error => {
      logger.error(`❌ Websocket error due ${error.message}`);
    });

    this.socket.on("connect_error", err => {
      logger.error(`❌ Websocket connection error due ${err.message}`);

      if (!!err.message && err.message.toLowerCase().includes("unauthorized")) {
        logger.error("❌ Unauthorized access. Trying to refresh.");
        this.handleConnectionError();
      }
    });

    this.socket.io.on("reconnect_attempt", () => {
      logger.info("🔃 Trying to reconnect to server");
    });

    this.socket.io.on("reconnect_error", error => {
      logger.error(`❌ Error while reconnecting ${error.message}`);
    });

    this.socket.io.on("reconnect_failed", () => {
      logger.error(`❌ Fail to reconnect to server`);
    });

    this.socket.io.on("reconnect", () => {
      logger.info("🔄 Reconnected to server");
    });
  }

  public getIsConnected(): boolean {
    return this.socket.connected;
  }
}

export { WebSocketApp };
