import { Processing } from "autodroid";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";

export type OutputFileKind = "result_file" | "metrics_file";

export enum PROCESSING_STATUS {
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  CANCELLED = "CANCELLED",
}

export type IProcessingFileData = {
  filename: string;
  mime_type: string;
  size: number;
  md5_hash: string;
};

export type IProcessing = {
  configuration: ConfigurationManagerService<
    string,
    Omit<IProcessing, "configuration">
  >;

  data: Processing;
  container_id: string | null;
  internal_status: PROCESSING_STATUS | null;

  system_working_dir: string;
  system_input_dir: string;
  system_output_dir: string;

  volume_working_dir: string;
  volume_input_dir: string;
  volume_output_dir: string;
};
