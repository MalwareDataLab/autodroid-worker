import si from "systeminformation";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Test target import
import { getSystemDynamicInfo } from "./getSystemDynamicInfo.util";

vi.mock("systeminformation", () => ({ default: { getDynamicData: vi.fn() } }));

describe("Utils: getSystemDynamicInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the system dynamic data", async () => {
    (si.getDynamicData as Mock).mockResolvedValue({ mem: "y" });

    await expect(getSystemDynamicInfo()).resolves.toEqual({ mem: "y" });
    expect(si.getDynamicData).toHaveBeenCalledOnce();
  });
});
