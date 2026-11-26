/** Performance bands used on analysis tables and charts: green 70 %+, amber pass mark–69 %, red below the pass mark. */
export type Band = "good" | "fair" | "weak";
export const GOOD_FROM = 70;
export const DEFAULT_PASS_MARK = 50;

export function bandOf(pct: number, passMark = DEFAULT_PASS_MARK): Band {
  return pct >= GOOD_FROM ? "good" : pct >= passMark ? "fair" : "weak";
}

/** Status colours (validated dataviz status palette) and legend labels. */
export const BAND_COLOR: Record<Band, string> = { good: "#0aac23", fair: "#fbb315", weak: "#dc3c3d" };
export function bandLabels(passMark = DEFAULT_PASS_MARK): Record<Band, string> {
  return { good: `${GOOD_FROM}% and above`, fair: `${passMark}–${GOOD_FROM - 1}%`, weak: `Below ${passMark}%` };
}
