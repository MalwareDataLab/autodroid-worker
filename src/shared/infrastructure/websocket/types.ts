import { Socket } from "socket.io-client";
// Type import
import {
  ISocketWorkerProcessingAcquiredMessage,
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
  "worker:processing-acquired": (
    data: ISocketWorkerProcessingAcquiredMessage,
  ) => void;
}

export type WebsocketClient = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;
