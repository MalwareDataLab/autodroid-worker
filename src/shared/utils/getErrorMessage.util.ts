import { AxiosError } from "axios";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

export const getErrorMessage = (error: any): string => {
  if (error instanceof WorkerError) return `[${error.key}]: ${error.message}`;
  if (error instanceof AxiosError)
    return `[${error.config?.method} ${error.config?.baseURL}${error.config?.url}${error.response?.status ? ` ${error.response?.status}` : ""}] ${error.response?.data?.message || error.message || ""}`;
  if (error.message) return error.message;

  return "";
};
