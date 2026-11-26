import { describe, expect, it } from "vitest";
import { bandLabels, bandOf } from "@/lib/performance-band";

describe("performance bands", () => {
  it("uses 70 % and the pass mark as the borders", () => {
    expect(bandOf(70)).toBe("good");
    expect(bandOf(69.9)).toBe("fair");
    expect(bandOf(50)).toBe("fair");
    expect(bandOf(49.9)).toBe("weak");
    expect(bandOf(45, 40)).toBe("fair");
    expect(bandLabels(40).fair).toBe("40–69%");
  });
});
