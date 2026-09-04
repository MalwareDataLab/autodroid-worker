import { describe, expect, it } from "vitest";

// Test target import
import { DateHelpers } from "./dateHelper.util";

describe("Utils: DateHelpers", () => {
  it("should compare dates with isAfter", () => {
    expect(DateHelpers.isAfter("2024-01-02", "2024-01-01")).toBe(true);
    expect(DateHelpers.isAfter("2024-01-01", "2024-01-02")).toBe(false);
  });

  it("should compare dates with isBefore", () => {
    expect(DateHelpers.isBefore("2024-01-01", "2024-01-02")).toBe(true);
    expect(DateHelpers.isBefore("2024-01-02", "2024-01-01")).toBe(false);
  });

  it("should compare dates with isSame", () => {
    expect(DateHelpers.isSame("2024-01-01", "2024-01-01")).toBe(true);
    expect(DateHelpers.isSame("2024-01-01", "2024-01-02")).toBe(false);
  });

  it("should return the current utc date", () => {
    expect(DateHelpers.now().isValid()).toBe(true);
  });

  it("should add a duration to a date", () => {
    expect(
      DateHelpers.format(
        DateHelpers.add("2024-01-01", 1, "day").toDate(),
        "YYYY-MM-DD",
      ),
    ).toBe("2024-01-02");
  });

  it("should subtract a duration from a date", () => {
    expect(
      DateHelpers.format(
        DateHelpers.subtract("2024-01-02", 1, "day").toDate(),
        "YYYY-MM-DD",
      ),
    ).toBe("2024-01-01");
  });

  it("should format a date", () => {
    expect(DateHelpers.format("2024-06-15", "YYYY")).toBe("2024");
  });

  it("should parse an ISO string", () => {
    expect(DateHelpers.parseISOString("2024-01-01").isValid()).toBe(true);
  });

  it("should parse a config value", () => {
    expect(DateHelpers.parse("2024-01-01").isValid()).toBe(true);
  });
});
