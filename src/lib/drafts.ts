/**
 * Unsaved-work drafts for marks entry. Only cells the teacher changed are kept, each with the value the server had
 * when it was changed ("base"), so a draft never overwrites a mark someone else saved in the meantime.
 */
export type Draft = { savedAt: number; cells: Record<string, { v: string; base: string }> };

const ALIAS: Record<string, string> = { A: "ABS", ABSENT: "ABS", X: "EX", EXEMPT: "EX", EXEMPTED: "EX" };
/** Same meaning? ("50" = "50.0", "a" = "ABS", spaces and case ignored.) */
export function norm(v: string) {
  const t = v.trim(), up = t.toUpperCase();
  if (t !== "" && Number.isFinite(Number(t))) return String(Number(t));
  if (up === "ABS" || up === "EX") return up;
  return ALIAS[up] ?? t; // other text (e.g. a remark) keeps its case

}

/** Cells that differ from what the server has. */
export function changedCells(values: Record<string, string>, server: Record<string, string>): Draft["cells"] {
  const out: Draft["cells"] = {};
  for (const [k, v] of Object.entries(values)) {
    const base = server[k] ?? "";
    if (norm(v) !== norm(base)) out[k] = { v, base };
  }
  return out;
}

/** Server values with the draft applied where the server still has the draft's base value. */
export function applyDraft(server: Record<string, string>, draft: Draft | null) {
  const values = { ...server };
  let restored = 0, skipped = 0;
  if (draft) for (const [k, c] of Object.entries(draft.cells)) {
    if (!(k in server)) continue; // learner no longer on this sheet
    if (norm(server[k] ?? "") !== norm(c.base)) { skipped++; continue; } // changed by someone else since
    if (norm(values[k]) !== norm(c.v)) { values[k] = c.v; restored++; }
  }
  return { values, restored, skipped };
}

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    return d && typeof d.savedAt === "number" && d.cells && typeof d.cells === "object" ? d : null;
  } catch { return null; }
}
