import { Socket } from "socket.io-client";

// Type import
import { ISocketWorkerProcessingJobMessage } from "./socket.types";

export interface ServerToClientEvents {
  pong: () => void;

  workerProcessingJob: (data: ISocketWorkerProcessingJobMessage) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
}

export type WebsocketClient = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;
