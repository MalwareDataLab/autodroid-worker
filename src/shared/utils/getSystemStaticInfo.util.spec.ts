import si from "systeminformation";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// Target import
import { getSystemStaticInfo } from "./getSystemStaticInfo.util";

vi.mock("systeminformation", () => ({ default: { getStaticData: vi.fn() } }));

describe("Utils: getSystemStaticInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should collect the system static data once and reuse it on later calls", async () => {
    (si.getStaticData as Mock).mockResolvedValue({ cpu: "x" });

    await expect(getSystemStaticInfo()).resolves.toEqual({ cpu: "x" });
    await expect(getSystemStaticInfo()).resolves.toEqual({ cpu: "x" });

    expect(si.getStaticData).toHaveBeenCalledOnce();
  });
});
