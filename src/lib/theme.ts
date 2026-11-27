/**
 * School theme colour: one chosen colour → the full set of "brand" shades (50 … 950) used by the menu bar,
 * buttons, links and highlights. Shades are made in OKLCH with fixed lightness steps, so every colour keeps
 * readable text (links on white, white on the menu bar) whatever hue the school picks.
 */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

/** The original blue (Tailwind blue) — used when no theme colour is set. */
export const DEFAULT_BRAND: Record<Shade, string> = {
  50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6",
  600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a", 950: "#172554",
};

/** Suggested school colours (all pass the contrast checks). */
export const PRESETS: { name: string; hex: string }[] = [
  { name: "Royal blue (default)", hex: "#1d4ed8" }, { name: "Navy", hex: "#1e3a8a" }, { name: "Maroon", hex: "#7f1d1d" },
  { name: "Green", hex: "#15803d" }, { name: "Purple", hex: "#6b21a8" }, { name: "Teal", hex: "#0f766e" },
  { name: "Brown", hex: "#78350f" }, { name: "Wine", hex: "#9d174d" },
];

const L: Record<Shade, number> = { 50: 0.97, 100: 0.935, 200: 0.885, 300: 0.81, 400: 0.715, 500: 0.625, 600: 0.55, 700: 0.49, 800: 0.425, 900: 0.375, 950: 0.28 };
const C: Record<Shade, number> = { 50: 0.12, 100: 0.25, 200: 0.42, 300: 0.62, 400: 0.82, 500: 0.95, 600: 1, 700: 1, 800: 0.9, 900: 0.78, 950: 0.62 };

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: [number, number, number]) {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}
const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L0 = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L0, c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180) / Math.PI };
}

/** OKLCH → linear sRGB (may be out of gamut). */
function oklchToLin(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}
const inGamut = (v: number[]) => v.every((x) => x >= -0.0001 && x <= 1.0001);

/** The colour at lightness l, hue h, chroma as close to c as the screen can show. */
function shade(l: number, c: number, h: number): string {
  let lo = 0, hi = c;
  if (!inGamut(oklchToLin(l, c, h))) {
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToLin(l, mid, h))) lo = mid; else hi = mid; }
    c = lo;
  }
  return rgbToHex(oklchToLin(l, c, h).map(fromLin) as [number, number, number]);
}

/** All brand shades for a theme colour (default blue when none / invalid). */
export function brandScale(hex: string | null | undefined): Record<Shade, string> {
  if (!hex || !isHex(hex)) return DEFAULT_BRAND;
  const { c, h } = hexToOklch(hex);
  const out = {} as Record<Shade, string>;
  for (const s of SHADES) out[s] = shade(L[s], Math.min(c, 0.25) * C[s], h);
  return out;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => { const [r, g, bl] = hexToRgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** CSS that sets the brand shades as "r g b" variables (read by tailwind.config.ts). */
export function themeCss(hex: string | null | undefined): string {
  const scale = brandScale(hex);
  return ":root{" + SHADES.map((s) => `--brand-${s}:${hexToRgb(scale[s]).join(" ")}`).join(";") + "}";
}

/**
 * Up to `max` distinct strong colours in a picture (e.g. the school crest), most common first.
 * `data` is RGBA pixels (canvas ImageData). White, black, greys and transparent pixels are ignored.
 */
export function logoSwatches(data: ArrayLike<number>, max = 4): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || mx - mn < 50) continue; // too dark or too grey
    const { h } = hexToOklch(rgbToHex([r, g, b]));
    const key = Math.round(((h + 360) % 360) / 20) % 18; // 20° hue buckets
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++; k.r += r; k.g += g; k.b += b; buckets.set(key, k);
  }
  const total = [...buckets.values()].reduce((s, k) => s + k.n, 0);
  return [...buckets.values()]
    .filter((k) => k.n >= Math.max(3, total * 0.03))
    .sort((p, q) => q.n - p.n)
    .slice(0, max)
    .map((k) => rgbToHex([k.r / k.n, k.g / k.n, k.b / k.n]));
}
