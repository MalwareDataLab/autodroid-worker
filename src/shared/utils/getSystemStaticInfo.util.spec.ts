import si from "systeminformation";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Test target import
import { getSystemStaticInfo } from "./getSystemStaticInfo.util";

vi.mock("systeminformation", () => ({ default: { getStaticData: vi.fn() } }));

describe("Utils: getSystemStaticInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the system static data", async () => {
    (si.getStaticData as Mock).mockResolvedValue({ cpu: "x" });

    await expect(getSystemStaticInfo()).resolves.toEqual({ cpu: "x" });
    expect(si.getStaticData).toHaveBeenCalledOnce();
  });
});
