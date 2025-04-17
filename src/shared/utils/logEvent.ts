import { getEnvConfig } from "@config/env";
import { Sentry } from "@shared/infrastructure/sentry";

const logEvent = (event: string, data?: Record<string, any>) => {
  Sentry.captureEvent({
    message: event,
    extra: data,
    server_name: getEnvConfig().NAME,
  });
};

export { logEvent };
