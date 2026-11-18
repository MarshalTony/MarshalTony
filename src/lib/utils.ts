import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Num = number | string | { toString(): string } | null | undefined;

export function toNumber(v: Num): number {
  if (v === null || v === undefined || v === "") return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

/** UGX has no minor unit in everyday use: show whole shillings. */
export function ugx(v: Num, withSymbol = true) {
  const n = Math.round(toNumber(v));
  const s = new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(n);
  return withSymbol ? `UGX ${s}` : s;
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "Africa/Kampala" }).format(date);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  return fmtDate(d, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** yyyy-mm-dd for <input type="date"> */
export function isoDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/** Today's date in Kampala as a UTC-midnight Date (for @db.Date columns). */
export function todayDate() {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
  return new Date(`${s}T00:00:00.000Z`);
}

export function dateOnly(s: string) {
  return new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
}

export function studentName(s: { firstName: string; lastName: string; otherNames?: string | null }) {
  return [s.lastName, s.firstName, s.otherNames].filter(Boolean).join(" ");
}

export function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function ordinal(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
