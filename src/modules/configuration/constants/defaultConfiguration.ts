// Enum import
import { CONFIGURATION } from "../types/configuration.enum";

export const defaultConfiguration = {
  [CONFIGURATION.AUTHENTICATION]: {
    registration_token: null as string | null | undefined,

    internal_id: null as string | null | undefined,
    signature: null as string | null | undefined,

    worker_id: null as string | null | undefined,

    refresh_token: null as string | null | undefined,
    refresh_token_expires_at: null as string | null | undefined,

    access_token: null as string | null | undefined,
    access_token_expires_at: null as string | null | undefined,
  },
  [CONFIGURATION.JOB]: {},

  [CONFIGURATION.COMMON]: {},
} satisfies Record<CONFIGURATION, Record<string, any>>;
