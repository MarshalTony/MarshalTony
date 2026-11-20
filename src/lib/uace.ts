/**
 * A-Level (UACE-style) grading used on the S5–S6 report, as on the school's sample card.
 * Pure functions (unit-tested).
 *
 * - Each paper is graded D1–F9 from its percentage (bands editable in Settings → Grading, scale "Paper grades").
 * - Principal subject grade from its papers (worst paper decides):
 *   all papers D1/D2 → A (6) · worst C3 → B (5) · worst C4 → C (4) · worst C5 → D (3) · worst C6 → E (2)
 *   · worst P7/P8 → O (1) · any F9 → F (0).
 * - Subsidiary subject (General Paper, Sub-Maths, Sub-ICT): O (1) when every paper is C6 or better, otherwise F (0).
 * - A paper with no mark while another paper of the subject has one counts as 0 (F9).
 */

export type PaperBand = { grade: string; minScore: number; maxScore: number; points: number; remark: string };

/** Default paper grades (points = the grade number 1–9). */
export const DEFAULT_PAPER_BANDS: PaperBand[] = [
  { grade: "D1", minScore: 80, maxScore: 100, points: 1, remark: "EXCELLENT" },
  { grade: "D2", minScore: 70, maxScore: 79.99, points: 2, remark: "VERY GOOD" },
  { grade: "C3", minScore: 65, maxScore: 69.99, points: 3, remark: "GOOD" },
  { grade: "C4", minScore: 60, maxScore: 64.99, points: 4, remark: "GOOD" },
  { grade: "C5", minScore: 55, maxScore: 59.99, points: 5, remark: "FAIR" },
  { grade: "C6", minScore: 50, maxScore: 54.99, points: 6, remark: "FAIR" },
  { grade: "P7", minScore: 40, maxScore: 49.99, points: 7, remark: "WORK HARD" },
  { grade: "P8", minScore: 30, maxScore: 39.99, points: 8, remark: "WORK HARD" },
  { grade: "F9", minScore: 0, maxScore: 29.99, points: 9, remark: "WORK HARD" },
];

/** Subject grades and points (key printed on the card). */
export const SUBJECT_POINTS: { grade: string; points: number; remark: string }[] = [
  { grade: "A", points: 6, remark: "Excellent" },
  { grade: "B", points: 5, remark: "Very good" },
  { grade: "C", points: 4, remark: "Good" },
  { grade: "D", points: 3, remark: "Fair" },
  { grade: "E", points: 2, remark: "Pass" },
  { grade: "O", points: 1, remark: "Subsidiary pass" },
  { grade: "F", points: 0, remark: "Fail" },
];

/** Paper label as printed: principal P/1, P/2…; subsidiary S/1, S/2… */
export const paperLabel = (category: string, paper: number) => `${category === "SUBSIDIARY" ? "S" : "P"}/${paper}`;

/** Band for a percentage (highest minScore not above it). */
export function paperBand(percentage: number, bands: PaperBand[] = DEFAULT_PAPER_BANDS): PaperBand {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((b) => percentage >= b.minScore) ?? sorted[sorted.length - 1];
}

/** Paper grade number 1–9 (from the band's points, or the digit in the grade). */
export const gradeNumber = (b: PaperBand) => (b.points >= 1 && b.points <= 9 ? b.points : Number(b.grade.replace(/\D/g, "")) || 9);

const pick = (grade: string) => SUBJECT_POINTS.find((x) => x.grade === grade)!;

/** Subject grade from paper grade numbers (1 = D1 … 9 = F9). */
export function subjectGradeFromPapers(category: string, numbers: number[]): { grade: string; points: number; remark: string } | null {
  if (!numbers.length) return null;
  const worst = Math.max(...numbers);
  if (category === "SUBSIDIARY") return pick(worst <= 6 ? "O" : "F");
  if (worst >= 9) return pick("F");
  if (worst >= 7) return pick("O");
  const g = worst <= 2 ? "A" : worst === 3 ? "B" : worst === 4 ? "C" : worst === 5 ? "D" : "E";
  return pick(g);
}

export type PaperResult = { paper: number; percentage: number | null; band: PaperBand | null };

/**
 * Grades one subject from its paper percentages (null = no mark for that paper).
 * Returns null when no paper has a mark at all. Missing papers count as 0 when another paper has a mark.
 */
export function gradeSubject(category: string, percentages: (number | null)[], bands: PaperBand[] = DEFAULT_PAPER_BANDS) {
  if (!percentages.some((p) => p !== null)) return null;
  const papers: PaperResult[] = percentages.map((p, i) => {
    const pct = p ?? 0;
    return { paper: i + 1, percentage: p, band: paperBand(pct, bands) };
  });
  const subject = subjectGradeFromPapers(category, papers.map((p) => gradeNumber(p.band!)))!;
  return { papers, ...subject };
}

/**
 * Average of a paper across the term's exams (BOT, MOT, EOT…), as on the card: an exam with no mark counts as 0.
 * Rounded half up to a whole number. null when no exam has a mark.
 */
export function termAverage(scores: (number | null)[]): number | null {
  if (!scores.length || !scores.some((s) => s !== null)) return null;
  const sum = scores.reduce<number>((a, s) => a + (s ?? 0), 0);
  return Math.floor(sum / scores.length + 0.5);
}

/** Teacher initials as printed in the INITIAL column, e.g. "Okello Peter" → "OP". */
export const initials = (lastName: string, firstName: string) => `${lastName.trim()[0] ?? ""}${firstName.trim()[0] ?? ""}`.toUpperCase();
