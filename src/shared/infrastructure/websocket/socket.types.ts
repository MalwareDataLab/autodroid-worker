import type { Systeminformation } from "systeminformation";

export type ISocketWorkerProcessingJobMessage = {
  processing_id: string;
};

export type ISocketWorkerStatusMessage = {
  status: "WORK" | "IDLE";
  version: string;
  processing_ids: string[];
  telemetry: Systeminformation.DynamicData;
};
