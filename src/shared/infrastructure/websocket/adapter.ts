import { EventEmitter } from "node:stream";

// Type import
import { WebsocketClient } from "./types";

class WebsocketAdapterClass {
  private bus: EventEmitter;
  public readonly initialization: Promise<void>;

  private websocketClient: WebsocketClient;

  public async getClient(): Promise<WebsocketClient> {
    await this.initialization;
    return this.websocketClient;
  }

  constructor() {
    this.bus = new EventEmitter();
    this.initialization = new Promise(resolve => {
      this.bus.on("initialized", resolve);
    });
  }

  public initialize(client: WebsocketClient): void {
    this.websocketClient = client;
    this.bus.emit("initialized");
  }
}

const WebsocketAdapter = new WebsocketAdapterClass();
export { WebsocketAdapter };
