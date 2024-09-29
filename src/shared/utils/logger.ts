import { createLogger, format, transports } from "winston";

// Config import
import { getEnvConfig } from "@config/env";

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ message }) => `${message}`),
      ),
    }),
  ],
  silent: getEnvConfig().isTestEnv,
});

export { logger };
