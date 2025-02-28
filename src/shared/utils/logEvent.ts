import { Sentry } from "@shared/infrastructure/sentry";

const logEvent = (event: string, data?: Record<string, any>) => {
  Sentry.captureEvent({
    message: event,
    extra: data,
  });
};

export { logEvent };
