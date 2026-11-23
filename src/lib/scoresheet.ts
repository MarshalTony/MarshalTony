/** Pure helpers for the printed score sheet (unit-tested). */

export type SubjectStats = { candidates: number; mean: number | null; highest: number | null; lowest: number | null; grades: Record<string, number> };

/** Per-subject summary for the foot of the score sheet: candidates, mean (1 dp), highest, lowest and how many of each grade. */
export function subjectStats(cells: { score: number | null; grade: string | null }[], gradeOrder: string[]): SubjectStats {
  const scored = cells.filter((c) => c.score !== null) as { score: number; grade: string | null }[];
  const grades: Record<string, number> = Object.fromEntries(gradeOrder.map((g) => [g, 0]));
  for (const c of scored) if (c.grade) grades[c.grade] = (grades[c.grade] ?? 0) + 1;
  if (!scored.length) return { candidates: 0, mean: null, highest: null, lowest: null, grades };
  const v = scored.map((c) => c.score);
  return { candidates: v.length, mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, highest: Math.max(...v), lowest: Math.min(...v), grades };
}

/** Competition ranking (1, 1, 3) of values, higher first; null values get no position. */
export function positions(values: Map<string, number | null>): Map<string, number | null> {
  const list = [...values].filter(([, v]) => v !== null) as [string, number][];
  list.sort((a, b) => b[1] - a[1]);
  const out = new Map<string, number | null>([...values.keys()].map((k) => [k, null]));
  list.forEach(([k, v], i) => out.set(k, i > 0 && v === list[i - 1][1] ? out.get(list[i - 1][0])! : i + 1));
  return out;
}

/** "Okello Peter" → "OP". */
export const initialsOf = (lastName: string, firstName: string) => `${lastName.trim()[0] ?? ""}${firstName.trim()[0] ?? ""}`.toUpperCase();
