/** Pure helpers for the student data clean-up check (unit-tested). */

/** Ugandan mobile (07…, +2567…) or landline (03…/04…, +2563…/+2564…) after removing spaces, dashes and brackets. */
export function isUgandanPhone(raw: string | null | undefined): boolean {
  const d = (raw ?? "").replace(/[\s()-]/g, "");
  return /^(\+?256|0)[347]\d{8}$/.test(d);
}

export type DupCandidate = { id: string; firstName: string; lastName: string; dateOfBirth: Date | null; classId: string };

/**
 * Likely duplicate students: the same two names (in either order, ignoring case and spaces) AND
 * - both dates of birth known and equal, or
 * - a date of birth missing on either record and both in the same class.
 * Different known birth dates mean different learners. Returns groups of two or more.
 */
export function likelyDuplicates<T extends DupCandidate>(students: T[]): T[][] {
  const key = (s: DupCandidate) => [s.firstName, s.lastName].map((x) => x.trim().toLowerCase().replace(/\s+/g, " ")).sort().join("|");
  const byName = new Map<string, T[]>();
  for (const s of students) byName.set(key(s), [...(byName.get(key(s)) ?? []), s]);
  const groups: T[][] = [];
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const same = (a: T, b: T) => (a.dateOfBirth && b.dateOfBirth ? a.dateOfBirth.getTime() === b.dateOfBirth.getTime() : a.classId === b.classId);
    const linked = list.filter((a) => list.some((b) => b !== a && same(a, b)));
    if (linked.length >= 2) groups.push(linked);
  }
  return groups;
}
