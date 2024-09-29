import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import AppInfo from "@/package.json";

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
  .option("env", {
    type: "string",
    default: "production",
    choices: ["development", "production"],
    alias: "e",
    description: "Environment to run the app",
  })
  .option("debug", {
    type: "boolean",
    alias: "d",
    default: false,
    description: "Enable debug mode",
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

if (argv.env) process.env.NODE_ENV = argv.env;
if (argv.debug) process.env.DEBUG = true;
if (argv.set)
  Object.entries(argv.set).forEach(([key, value]) => {
    process.env[key] = value;
  });

const worker = new Worker({
  registration_token: argv.token,
});

export { worker };
