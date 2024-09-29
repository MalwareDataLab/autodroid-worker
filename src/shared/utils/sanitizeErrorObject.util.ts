// Util import
import { sanitizeAxiosError } from "./sanitizeAxiosError.util";

const sanitizers = [sanitizeAxiosError];

const sanitizeErrorObject = <T>(error: T) => {
  if (!error || !Object.keys(error).length) return error;
  return Object.entries(error).reduce((acc, [key, value]) => {
    const sanitizedData = sanitizers.reduce<typeof value | null>(
      (result, sanitize) => {
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
