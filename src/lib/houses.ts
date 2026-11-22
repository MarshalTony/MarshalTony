/** Pure helpers for school houses and clubs (unit-tested). */

export type Placed = { houseId: string; classId: string; gender: string };
export type ToPlace = { id: string; classId: string; gender: string };

/**
 * Shares students without a house among the houses so that every house gets a fair share of each class and sex.
 * Each student goes to the house with the fewest students of the same class and sex, then of the same class,
 * then overall (ties: the order of `houseIds`). Students already in a house are counted, never moved.
 */
export function allocateHouses(students: ToPlace[], houseIds: string[], existing: Placed[] = []): Map<string, string> {
  const out = new Map<string, string>();
  if (!houseIds.length) return out;
  const count = new Map<string, number>();
  const inc = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  const get = (k: string) => count.get(k) ?? 0;
  const add = (h: string, c: string, g: string) => { inc(`${h}|${c}|${g}`); inc(`${h}|${c}`); inc(h); };
  for (const e of existing) if (houseIds.includes(e.houseId)) add(e.houseId, e.classId, e.gender);
  for (const s of students) {
    let best = houseIds[0];
    for (const h of houseIds.slice(1)) {
      const a = [get(`${h}|${s.classId}|${s.gender}`), get(`${h}|${s.classId}`), get(h)];
      const b = [get(`${best}|${s.classId}|${s.gender}`), get(`${best}|${s.classId}`), get(best)];
      if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) best = h;
    }
    out.set(s.id, best);
    add(best, s.classId, s.gender);
  }
  return out;
}

/** Club roles offered in the member list (blank = ordinary member). */
export const CLUB_ROLES = ["Chairperson", "Vice Chairperson", "Secretary", "Treasurer", "Publicity Secretary", "Committee Member"] as const;
