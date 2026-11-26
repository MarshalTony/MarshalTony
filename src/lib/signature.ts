/** Cleaning a photographed / scanned signature (unit-tested): paper becomes transparent, the ink is kept, the image is trimmed. */

/**
 * In place on RGBA pixels: light (paper) pixels become transparent, ink stays opaque, with a soft edge in between.
 * `paper` = brightness from which a pixel counts as paper (0–255); `ink` = brightness at or below which it is fully opaque.
 * Returns the bounding box of what is left (null when nothing is).
 */
export function clearPaper(px: Uint8ClampedArray, width: number, height: number, paper = 200, ink = 120): { x: number; y: number; w: number; h: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const a = lum >= paper ? 0 : lum <= ink ? 255 : Math.round(((paper - lum) / (paper - ink)) * 255);
      px[i + 3] = Math.min(px[i + 3], a);
      if (px[i + 3] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** The bounding box grown by a margin, kept inside the image. */
export function padBox(b: { x: number; y: number; w: number; h: number }, width: number, height: number, margin = 8) {
  const x = Math.max(0, b.x - margin), y = Math.max(0, b.y - margin);
  return { x, y, w: Math.min(width, b.x + b.w + margin) - x, h: Math.min(height, b.y + b.h + margin) - y };
}
