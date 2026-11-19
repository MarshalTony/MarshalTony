export type BankEntry = { role: string; minScore: number; maxScore: number; text: string };
export const COMMENT_ROLES = [
  { value: "CLASS_TEACHER", label: "Class teacher" },
  { value: "HEADTEACHER", label: "Headteacher" },
  { value: "DOS", label: "Director of Studies" },
] as const;

/** Comments for a role whose range contains the score (inclusive). */
export function matching(bank: BankEntry[], role: string, score: number | null): BankEntry[] {
  if (score === null || !Number.isFinite(score)) return [];
  return bank.filter((b) => b.role === role && score >= b.minScore && score <= b.maxScore);
}

/**
 * A comment for the student: `variant` rotates through the matches so neighbouring students do not all
 * get the same sentence. {name} becomes the first name. Returns "" when nothing matches.
 */
export function pickComment(bank: BankEntry[], role: string, score: number | null, firstName: string, variant = 0): string {
  const m = matching(bank, role, score);
  if (!m.length) return "";
  const text = m[((variant % m.length) + m.length) % m.length].text;
  return text.replaceAll("{name}", firstName);
}
