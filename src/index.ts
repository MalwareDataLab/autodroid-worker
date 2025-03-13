import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z } from "zod";

import AppInfo from "@/package.json";

import { logger } from "@shared/utils/logger";
import { Worker } from "./shared/infrastructure/worker";

const argv = yargs(hideBin(process.argv))
  .scriptName(AppInfo.name)
  .usage("$0 [args]")
  .option("token", {
    type: "string",
    alias: "t",
    demandOption: false,
    description: "Authentication token for worker",
  })
  .option("name", {
    type: "string",
    alias: "n",
    description: "Name of the worker",
  })
  .option("env", {
    type: "string",
    choices: ["development", "production"],
    alias: "e",
    description: "Environment to run the app",
  })
  .option("debug", {
    type: "boolean",
    alias: "d",
    description: "Enable debug mode",
  })
  .option("url", {
    type: "string",
    alias: "u",
    description: "The server URL",
  })
  .option("set", {
    type: "array",
    alias: "s",
    description: "Set environment variables in the format KEY=VALUE",
    coerce: args => {
      const envVars: Record<string, string> = {};
      args.forEach((arg: string) => {
        const [key, value] = arg.split("=");
        if (key && value) {
          envVars[key] = value;
        }
      });
      return envVars;
    },
  })

  .help()
  .parseSync();

const config = {
  REGISTRATION_TOKEN: argv.token || process.env.REGISTRATION_TOKEN,
  NAME: argv.name || process.env.NAME,
  NODE_ENV: argv.env || process.env.NODE_ENV || "production",
  DEBUG: String(argv.debug || process.env.DEBUG) === "true" ? "true" : "false",
  API_BASE_URL:
    argv.url || process.env.API_BASE_URL || "https://mdl-api.unihacker.club",
};

if (argv.set)
  Object.entries(argv.set)
    .filter(([, value]) => !!value)
    .forEach(([key, value]) => {
      process.env[key] = value;
    });

const configSchema = z.object({
  REGISTRATION_TOKEN: z.string().optional(),
  NAME: z.string(),
  NODE_ENV: z.enum(["development", "production"]),
  DEBUG: z.enum(["true", "false"]),
  API_BASE_URL: z.string().url(),
});

const parsedConfig = configSchema.safeParse(config);

if (!parsedConfig.success) {
  const formattedErrors = parsedConfig.error.errors
    .map(err => `${err.path.join(".")}`)
    .join(", ");
  logger.error(`❌ Invalid configuration: ${formattedErrors}`);
  process.exit(1);
}

Object.entries(parsedConfig.data)
  .filter(([, value]) => !!value)
  .forEach(([key, value]) => {
    process.env[key] = value;
  });

const worker = new Worker({
  name: process.env.NAME,
  registration_token: process.env.REGISTRATION_TOKEN,
});

export { worker };
