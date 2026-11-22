/** Pure helpers for academic years and terms (unit-tested). */

export type TermDates = { number: number; startDate: string; endDate: string }; // YYYY-MM-DD

const shiftYear = (iso: string, by: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + by, m - 1, d)); // 29 Feb becomes 1 Mar in a non-leap year
  return dt.toISOString().slice(0, 10);
};

/** Next year's name: "2026" → "2027"; "2026/27" → "2027/28"; otherwise "". */
export function nextYearName(name: string): string {
  const one = name.match(/^(\d{4})$/);
  if (one) return String(Number(one[1]) + 1);
  const two = name.match(/^(\d{4})\s*[/-]\s*(\d{2,4})$/);
  if (two) { const a = Number(two[1]) + 1; const b = two[2].length === 2 ? String((Number(two[2]) + 1) % 100).padStart(2, "0") : String(Number(two[2]) + 1); return `${a}/${b}`; }
  return "";
}

/** Suggested dates for a new year: the latest year's terms moved forward one year (or Feb–Dec defaults). */
export function suggestTerms(previous: TermDates[], newYear: number): TermDates[] {
  if (previous.length) {
    const prevYear = Number(previous[0].startDate.slice(0, 4));
    return [...previous].sort((a, b) => a.number - b.number).map((t) => ({ number: t.number, startDate: shiftYear(t.startDate, newYear - prevYear), endDate: shiftYear(t.endDate, newYear - prevYear) }));
  }
  return [
    { number: 1, startDate: `${newYear}-02-02`, endDate: `${newYear}-04-30` },
    { number: 2, startDate: `${newYear}-05-25`, endDate: `${newYear}-08-14` },
    { number: 3, startDate: `${newYear}-09-07`, endDate: `${newYear}-11-27` },
  ];
}

/** Problems with a year's terms (empty = fine): each term ends after it starts, terms follow each other without overlapping, and lie inside the year. */
export function termProblems(terms: TermDates[], year: { startDate: string; endDate: string }): string[] {
  const out: string[] = [];
  const sorted = [...terms].sort((a, b) => a.number - b.number);
  sorted.forEach((t, i) => {
    if (!t.startDate || !t.endDate) { out.push(`Term ${t.number}: enter both dates`); return; }
    if (t.endDate <= t.startDate) out.push(`Term ${t.number}: closing date must be after opening date`);
    if (t.startDate < year.startDate || t.endDate > year.endDate) out.push(`Term ${t.number}: must be inside the year (${year.startDate} to ${year.endDate})`);
    const prev = sorted[i - 1];
    if (prev?.endDate && t.startDate <= prev.endDate) out.push(`Term ${t.number} must open after Term ${prev.number} closes`);
  });
  return out;
}
