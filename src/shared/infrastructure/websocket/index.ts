import { io } from "socket.io-client";

// Util import
import { executeAction } from "@shared/utils/executeAction.util";

// Type import
import { AppContext } from "@shared/types/appContext.type";
import { WebsocketClient } from "./types";

class WebSocketApp {
  public socket: WebsocketClient;

  constructor({ context }: { context: AppContext }) {
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
      console.log("✅ Connected to server");
    });

    this.socket.on("disconnect", () => {
      console.log("⭕ Disconnected from server");
    });

    this.socket.io.on("error", error => {
      console.log(`❌ Websocket error due ${error.message}`);
    });

    this.socket.on("connect_error", err => {
      console.log(`❌ Websocket connection error due ${err.message}`);

      if (!!err.message && err.message.toLowerCase().includes("unauthorized"))
        console.log("❌ Unauthorized access.");
    });

    this.socket.io.on("reconnect_attempt", () => {
      console.log("🔃 Trying to reconnect to server");
    });

    this.socket.io.on("reconnect_error", error => {
      console.log(`❌ Error while reconnecting ${error.message}`);
    });

    this.socket.io.on("reconnect_failed", () => {
      console.log(`❌ Fail to reconnect to server`);
    });

    this.socket.io.on("reconnect", () => {
      console.log("🔄 Reconnected to server");
    });
  }

  public getIsConnected(): boolean {
    return this.socket.connected;
  }
}

export { WebSocketApp };
