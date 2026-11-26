import { describe, expect, it } from "vitest";
import { clearPaper, padBox } from "@/lib/signature";

const img = (w: number, h: number, ink: [number, number][]) => {
  const px = new Uint8ClampedArray(w * h * 4).fill(255); // white paper
  for (const [x, y] of ink) { const i = (y * w + x) * 4; px[i] = 20; px[i + 1] = 30; px[i + 2] = 90; }
  return px;
};
describe("signature clean-up", () => {
  it("makes paper transparent, keeps the ink and finds its box", () => {
    const px = img(10, 6, [[3, 2], [4, 2], [6, 4]]);
    const box = clearPaper(px, 10, 6);
    expect(box).toEqual({ x: 3, y: 2, w: 4, h: 3 });
    expect(px[(0 * 10 + 0) * 4 + 3]).toBe(0); // paper
    expect(px[(2 * 10 + 3) * 4 + 3]).toBe(255); // ink
  });
  it("gives grey pixels a soft edge and returns null for a blank page", () => {
    const px = new Uint8ClampedArray([160, 160, 160, 255]);
    clearPaper(px, 1, 1);
    expect(px[3]).toBeGreaterThan(0);
    expect(px[3]).toBeLessThan(255);
    expect(clearPaper(img(4, 4, []), 4, 4)).toBeNull();
  });
  it("adds a margin inside the image", () => {
    expect(padBox({ x: 2, y: 1, w: 4, h: 3 }, 10, 6, 3)).toEqual({ x: 0, y: 0, w: 9, h: 6 });
  });
});
