import { Socket } from "socket.io-client";
// Type import
import {
  ISocketWorkerProcessingJobMessage,
  ISocketWorkerStatusMessage,
} from "./socket.types";

export interface ServerToClientEvents {
  pong: () => void;

  "worker:work": (data: ISocketWorkerProcessingJobMessage) => void;
  "worker:get-status": () => void;
}

export interface ClientToServerEvents {
  ping: () => void;

  "worker:status": (data: ISocketWorkerStatusMessage) => void;
}

export type WebsocketClient = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;
