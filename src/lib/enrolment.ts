/** Pure helpers for enrolment statistics (unit-tested). */

/** Completed years on `ref` (EMIS uses age on 1 January of the school year). */
export function ageOn(dob: Date, ref: Date): number {
  let a = ref.getUTCFullYear() - dob.getUTCFullYear();
  const m = ref.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) a--;
  return a;
}

/** EMIS-style age bands: under 12, each year 12–19, 20 and over, unknown. */
export function ageBand(dob: Date | null, ref: Date): string {
  if (!dob) return "Unknown";
  const a = ageOn(dob, ref);
  if (a < 12) return "Under 12";
  if (a >= 20) return "20+";
  return String(a);
}
export const AGE_BANDS = ["Under 12", "12", "13", "14", "15", "16", "17", "18", "19", "20+", "Unknown"];

/** Count items into rows × columns, each split by sex (M/F). Returns counts[row][col] = { M, F }. */
export function crossBySex<T>(items: T[], row: (t: T) => string, col: (t: T) => string, sex: (t: T) => "MALE" | "FEMALE") {
  const out = new Map<string, Map<string, { M: number; F: number }>>();
  for (const t of items) {
    const r = row(t), c = col(t);
    if (!out.has(r)) out.set(r, new Map());
    const cell = out.get(r)!.get(c) ?? { M: 0, F: 0 };
    if (sex(t) === "MALE") cell.M++; else cell.F++;
    out.get(r)!.set(c, cell);
  }
  return out;
}
