import { createLogger, format, transports } from "winston";

// Config import
import { getEnvConfig } from "@config/env";

const customFormat = format.printf(({ timestamp, level, message }) => {
  return `[${timestamp}] [${level}] ${message}`;
});

const logger = createLogger({
  level: "info",
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    format.errors({ stack: true }),
    customFormat,
  ),
  transports: [new transports.Console()],
  silent: getEnvConfig().isTestEnv,
});

export { logger };
