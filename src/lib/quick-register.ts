/** Pure helpers for Students → Quick registration (unit-tested). */

export type QuickRow = {
  lastName: string; firstName: string; otherNames: string; gender: string; residence: string; dateOfBirth: string;
  linNumber: string; houseId: string; combinationId: string; guardianName: string; guardianPhone: string;
};

export const QUICK_COLUMNS = ["lastName", "firstName", "otherNames", "gender", "residence", "dateOfBirth", "linNumber", "guardianName", "guardianPhone"] as const;

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "m", "Male", "boy" → MALE; "f", "Female", "girl" → FEMALE; anything else is kept (and reported). */
export function parseSex(raw: string): string {
  const v = clean(raw).toLowerCase();
  if (["m", "male", "boy", "b"].includes(v)) return "MALE";
  if (["f", "female", "girl", "g"].includes(v)) return "FEMALE";
  return v ? raw.trim() : "";
}

/** Blank → DAY; "d", "day" → DAY; "b", "boarder", "boarding" → BOARDING. */
export function parseResidence(raw: string): string {
  const v = clean(raw).toLowerCase();
  if (!v || ["d", "day", "day scholar"].includes(v)) return "DAY";
  if (["b", "boarder", "boarding", "brd"].includes(v)) return "BOARDING";
  return raw.trim();
}

/** YYYY-MM-DD or DD/MM/YYYY (also D-M-YYYY, D.M.YYYY) → YYYY-MM-DD; blank → ""; otherwise "invalid". */
export function parseDob(raw: string): string {
  const v = clean(raw);
  if (!v) return "";
  let y: number, m: number, d: number;
  let x = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else if ((x = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
  else return "invalid";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return dt.toISOString().slice(0, 10);
}

export function normaliseQuickRow(r: QuickRow): QuickRow {
  return {
    lastName: clean(r.lastName), firstName: clean(r.firstName), otherNames: clean(r.otherNames),
    gender: parseSex(r.gender), residence: parseResidence(r.residence), dateOfBirth: parseDob(r.dateOfBirth),
    linNumber: clean(r.linNumber).toUpperCase(), houseId: clean(r.houseId), combinationId: clean(r.combinationId),
    guardianName: clean(r.guardianName), guardianPhone: clean(r.guardianPhone).replace(/[\s()-]/g, ""),
  };
}

const nameKey = (a: { firstName: string; lastName: string }) => [a.firstName, a.lastName].map((x) => x.trim().toLowerCase()).sort().join("|");

/** Every problem in the (normalised) rows, as "Row n (Name): problem". Empty = all fine. */
export function quickRowProblems(
  rows: QuickRow[],
  opts: { aLevel: boolean; houseIds: Set<string>; combinationIds: Set<string>; existing: { firstName: string; lastName: string; admissionNo: string }[]; today?: Date },
): string[] {
  const out: string[] = [];
  const today = (opts.today ?? new Date()).toISOString().slice(0, 10);
  const existing = new Map(opts.existing.map((s) => [nameKey(s), s.admissionNo]));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const who = `Row ${i + 1}${r.lastName || r.firstName ? ` (${[r.lastName, r.firstName].filter(Boolean).join(" ")})` : ""}`;
    const p: string[] = [];
    if (!r.lastName) p.push("surname missing");
    if (!r.firstName) p.push("first name missing");
    if (r.gender !== "MALE" && r.gender !== "FEMALE") p.push(r.gender ? `sex "${r.gender}" not understood (use M or F)` : "sex missing");
    if (r.residence !== "DAY" && r.residence !== "BOARDING") p.push(`"${r.residence}" is not Day or Boarding`);
    if (r.dateOfBirth === "invalid") p.push("date of birth not understood (use DD/MM/YYYY)");
    else if (r.dateOfBirth && r.dateOfBirth >= today) p.push("date of birth is in the future");
    if (r.houseId && !opts.houseIds.has(r.houseId)) p.push("unknown house");
    if (r.combinationId && (!opts.aLevel || !opts.combinationIds.has(r.combinationId))) p.push("unknown combination");
    if (r.guardianPhone && !/^\+?\d{9,15}$/.test(r.guardianPhone)) p.push(`parent phone "${r.guardianPhone}" is not a phone number`);
    if (r.guardianPhone && !r.guardianName) p.push("parent's name missing (a phone was given)");
    if (r.guardianName && !r.guardianPhone) p.push("parent's phone missing (a name was given)");
    if (r.lastName && r.firstName) {
      const k = nameKey(r);
      if (seen.has(k)) p.push(`same name as row ${seen.get(k)! + 1}`);
      else seen.set(k, i);
      if (existing.has(k)) p.push(`already in this class (${existing.get(k)})`);
    }
    if (p.length) out.push(`${who}: ${p.join(", ")}`);
  });
  return out;
}

/** Text pasted from Excel / Word: rows by line, cells by tab (a single column if no tabs). Trailing empty line dropped. */
export function parsePasted(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => l.split("\t"));
}
