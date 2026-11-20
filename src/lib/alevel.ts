/**
 * A-Level (S5–S6) subject rule agreed with the school: at most 3 principal subjects and 2 subsidiaries —
 * General Paper plus EITHER Subsidiary Mathematics OR Subsidiary ICT (never both).
 */
export type ALevelSubject = { code: string; name: string; category: string };

export const GENERAL_PAPER = "GP";
export const MAX_PRINCIPALS = 3;

/** Problems with a student's A-Level subjects (empty = fine). `complete` also requires the full set (3 + GP + 1). */
export function aLevelProblems(subjects: ALevelSubject[], opts: { complete?: boolean } = {}): string[] {
  const principals = subjects.filter((s) => s.category === "PRINCIPAL");
  const subs = subjects.filter((s) => s.category === "SUBSIDIARY");
  const gp = subs.filter((s) => s.code === GENERAL_PAPER);
  const others = subs.filter((s) => s.code !== GENERAL_PAPER);
  const out: string[] = [];
  if (principals.length > MAX_PRINCIPALS) out.push(`${principals.length} principal subjects — the maximum is ${MAX_PRINCIPALS}`);
  if (others.length > 1) out.push(`both ${others.map((s) => s.name).join(" and ")} — choose only one of them`);
  if (subs.length > 2) out.push(`${subs.length} subsidiary subjects — the maximum is 2 (General Paper + Sub-Maths or Sub-ICT)`);
  if (opts.complete) {
    if (principals.length < MAX_PRINCIPALS) out.push(`only ${principals.length} principal subject(s) — needs ${MAX_PRINCIPALS}`);
    if (!gp.length) out.push("no General Paper");
    if (!others.length) out.push("no Sub-Maths or Sub-ICT");
  }
  return out;
}
