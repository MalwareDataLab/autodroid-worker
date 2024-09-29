import { defaultConfiguration } from "../constants/defaultConfiguration";
import { CONFIGURATION } from "./configuration.enum";

export type ConfigurationData<T extends CONFIGURATION> =
  (typeof defaultConfiguration)[T];
