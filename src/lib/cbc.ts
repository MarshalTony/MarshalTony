/**
 * Competency-based curriculum (lower secondary) report calculations.
 *  - Each chapter/theme activity is scored out of 3 (one decimal).
 *  - Subject average = mean of the chapter scores that were entered.
 *  - Identifier/descriptor from the configured activity bands (default 3: 2.5–3.0 Outstanding,
 *    2: 1.5–2.49 Moderate, 1: 0.1–1.49 Basic).
 *  - End-of-term summary: Out of 20 = round(average ÷ 3 × 20); EOT/80 = round(score ÷ max × 80);
 *    Total = Out of 20 + EOT/80, graded on the O-Level scale.
 *    A subject with chapters but no scores counts as 0/20; a subject with no chapters shows no
 *    activity column and its total is the EOT mark alone.
 */
export type Band = { grade: string; minScore: number; maxScore: number; remark: string; description?: string | null };

export const DEFAULT_ACTIVITY_BANDS: Band[] = [
  { grade: "3", minScore: 2.5, maxScore: 3, remark: "Outstanding", description: "Most or all LOs achieved for overall achievement" },
  { grade: "2", minScore: 1.5, maxScore: 2.49, remark: "Moderate", description: "Many LOs achieved, enough for overall achievement" },
  { grade: "1", minScore: 0.1, maxScore: 1.49, remark: "Basic", description: "Few LOs achieved, but not sufficient for overall achievement" },
];

export const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/** Mean of the entered chapter scores (null when none entered). */
export function activityAverage(scores: (number | null | undefined)[]): number | null {
  const v = scores.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

/** Band whose minimum is at or below the score (bands may have gaps such as 2.49 → 2.5). Below the lowest band → none. */
export function bandFor(score: number | null, bands: Band[]): Band | null {
  if (score === null) return null;
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((b) => score >= b.minScore) ?? null;
}

export function outOf20(avg: number | null): number {
  return avg === null ? 0 : Math.round((avg / 3) * 20);
}

export function eotOutOf80(score: number | null, max: number): number | null {
  if (score === null || !(max > 0)) return null;
  return Math.round((score / max) * 80);
}

export type SummaryRow = { out20: number | null; eot80: number | null; total: number | null };

export function summaryRow(args: { hasActivities: boolean; activityAvg: number | null; eotScore: number | null; eotMax: number }): SummaryRow {
  const out20 = args.hasActivities ? outOf20(args.activityAvg) : null;
  const eot80 = eotOutOf80(args.eotScore, args.eotMax);
  const total = out20 === null && eot80 === null ? null : (out20 ?? 0) + (eot80 ?? 0);
  return { out20, eot80, total };
}

export function validActivityScore(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 3) return "invalid";
  return round1(n);
}
