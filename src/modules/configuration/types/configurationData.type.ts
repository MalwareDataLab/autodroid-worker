// Config import
import { defaultConfiguration } from "../constants/defaultConfiguration";

// Enum import
import { CONFIGURATION } from "./configuration.enum";

export type ConfigurationData<T extends CONFIGURATION> =
  (typeof defaultConfiguration)[T];
