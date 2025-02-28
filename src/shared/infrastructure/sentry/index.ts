import { getEnvConfig } from "@config/env";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: "https://60d89a205f07dafa3b503f8e4c32f238@o4508853891497984.ingest.us.sentry.io/4508894352048128",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  environment: getEnvConfig().NODE_ENV,
});

Sentry.profiler.startProfiler();

export { Sentry };
