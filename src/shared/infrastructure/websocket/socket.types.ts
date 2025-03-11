import type { Systeminformation } from "systeminformation";

export enum WORKER_STATUS {
  WORK = "WORK",
  PREPARING = "PREPARING",
  IDLE = "IDLE",
  SHUTDOWN = "SHUTDOWN",
  UNKNOWN = "UNKNOWN",
}

export type ISocketWorkerProcessingJobMessage = {
  processing_id: string;
};

export type ISocketWorkerStatusMessage = {
  status: WORKER_STATUS;
  version: string;
  processing_ids: string[];
  telemetry: Systeminformation.DynamicData;
};

export type ISocketWorkerProcessingAcquiredMessage = {
  processing_id: string;
};
