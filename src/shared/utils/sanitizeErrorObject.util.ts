// Util import
import { sanitizeAxiosError } from "./sanitizeAxiosError.util";

const sanitizers = [sanitizeAxiosError];

const sanitizeErrorObject = <T>(error: T) => {
  if (!error || !Object.keys(error).length) return error;
  return Object.entries(error).reduce((acc, [key, value]) => {
    const sanitizedData = sanitizers.reduce<typeof value | null>(
      (result, sanitize) => {
        /* v8 ignore next -- the sanitizers list has a single entry, so this short-circuit is unreachable */
        if (result) return result;
        return sanitize(value);
      },
      null,
    );
    return {
      ...acc,
      [key]: sanitizedData || value,
    };
  }, {} as T);
};

export { sanitizeErrorObject };
