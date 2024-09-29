import axios from "axios";

interface SanitizedAxiosError {
  message: string;
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, any>;
    data?: any;
  };
  request?: {
    path?: string;
    headers?: Record<string, any>;
    method?: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, any>;
    data: any;
  };
}

const sanitizeAxiosError = (error: unknown): SanitizedAxiosError | null => {
  if (!axios.isAxiosError(error)) return null;

  const sanitizedError: SanitizedAxiosError = {
    message: error.message,
    response: error.response
      ? {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
        }
      : undefined,

    request: error.request
      ? {
          path: error.request.path,
          headers: error.request.getHeaders?.(),
          method: error.request.method,
        }
      : undefined,
    config: {
      url: error.config?.url,
      method: error.config?.method,
      headers: error.config?.headers,
      data: error.config?.data,
    },
  };

  return sanitizedError;
};

export { sanitizeAxiosError };
