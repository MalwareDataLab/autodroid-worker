import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

abstract class DateHelper {
  static adapter = dayjs;

  static isAfter(date1: string | Date, date2: string | Date): boolean {
    return dayjs.utc(date1).isAfter(dayjs.utc(date2));
  }

  static isBefore(date1: string | Date, date2: string | Date): boolean {
    return dayjs.utc(date1).isBefore(dayjs.utc(date2));
  }

  static isSame(date1: string | Date, date2: string | Date): boolean {
    return dayjs.utc(date1).isSame(dayjs.utc(date2));
  }

  static now(): dayjs.Dayjs {
    return dayjs.utc();
  }

  static add(
    date: string | Date,
    value: number,
    unit: dayjs.ManipulateType,
  ): dayjs.Dayjs {
    return dayjs.utc(date).add(value, unit);
  }

  static subtract(
    date: string | Date,
    value: number,
    unit: dayjs.ManipulateType,
  ): dayjs.Dayjs {
    return dayjs.utc(date).subtract(value, unit);
  }

  static format(date: string | Date, formatStr: string): string {
    return dayjs.utc(date).format(formatStr);
  }

  static parseISOString(dateStr: string): dayjs.Dayjs {
    return dayjs.utc(dateStr);
  }

  static parse(
    config: dayjs.ConfigType,
    format?: string,
    strict?: boolean,
  ): dayjs.Dayjs {
    return dayjs.utc(config, format, strict);
  }
}

export { DateHelper as DateHelpers };
