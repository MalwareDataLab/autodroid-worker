import { WorkerError } from "@shared/errors/WorkerError";
import { AxiosError } from "axios";

export const getErrorMessage = (error: any): string => {
  if (error instanceof WorkerError) return `[${error.key}]: ${error.message}`;
  if (error instanceof AxiosError)
    return error.response?.data?.message || error.message || "";
  if (error instanceof Error) return error.message;

  return "";
};
