import { describe, expect, it } from "vitest";
import { brandScale, contrast, DEFAULT_BRAND, logoSwatches, PRESETS, themeCss } from "@/lib/theme";

describe("theme colour", () => {
  it("keeps the original blue when no colour is set", () => {
    expect(brandScale(null)).toEqual(DEFAULT_BRAND);
    expect(brandScale("blue")).toEqual(DEFAULT_BRAND);
    expect(themeCss(null)).toContain("--brand-700:29 78 216");
  });
  it("gives readable shades for any hue (links on white, white on the menu bar)", () => {
    for (const hex of [...PRESETS.map((p) => p.hex), "#facc15", "#22c55e", "#06b6d4", "#808080", "#000000", "#ffffff"]) {
      const s = brandScale(hex);
      expect(contrast(s[700], "#ffffff"), hex).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s[800], "#ffffff"), hex).toBeGreaterThanOrEqual(6);
      expect(contrast(s[900], "#ffffff"), hex).toBeGreaterThanOrEqual(7);
      expect(contrast(s[200], s[900]), hex).toBeGreaterThanOrEqual(4.5); // small text on the menu bar
      expect(contrast(s[50], "#ffffff"), hex).toBeLessThan(1.15); // pale background tints
      for (const v of Object.values(s)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("keeps the hue of the chosen colour", () => {
    const s = brandScale("#7f1d1d"); // maroon → reddish shades
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(s[700].slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g + 40); expect(r).toBeGreaterThan(b + 40);
  });
  it("finds the strong colours of a crest, ignoring white and grey", () => {
    const px: number[] = [];
    const add = (n: number, rgba: number[]) => { for (let i = 0; i < n; i++) px.push(...rgba); };
    add(500, [255, 255, 255, 255]); add(200, [128, 128, 128, 255]); add(300, [120, 20, 30, 255]); add(100, [20, 120, 40, 255]); add(50, [0, 0, 200, 0]);
    const sw = logoSwatches(px);
    expect(sw).toHaveLength(2);
    expect(sw[0]).toBe("#78141e");
  });
});
