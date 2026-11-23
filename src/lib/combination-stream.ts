/** A-Level: place a student in the stream that holds their combination's category (unit-tested). */

export type Category = "ARTS" | "SCIENCES";
export const CATEGORY_LABEL: Record<Category, string> = { ARTS: "Arts", SCIENCES: "Sciences" };

/** The stream's category: as set in Settings, else from its name (ARTS → Arts, SCIENCE(S) → Sciences). */
export function streamCategory(s: { name: string; combinationCategory?: string | null }): Category | null {
  if (s.combinationCategory === "ARTS" || s.combinationCategory === "SCIENCES") return s.combinationCategory;
  const n = s.name.toUpperCase();
  if (n.includes("ART")) return "ARTS";
  if (n.includes("SCIEN")) return "SCIENCES";
  return null;
}

/**
 * The stream for a combination category among a class's active streams: the current stream if it already matches,
 * else the first matching stream by name; null when no stream holds that category (the student stays where they are).
 */
export function pickStream(streams: { id: string; name: string; isActive?: boolean; combinationCategory?: string | null }[], category: string | null | undefined, currentStreamId?: string | null): string | null {
  if (category !== "ARTS" && category !== "SCIENCES") return null;
  const fit = streams.filter((s) => s.isActive !== false && streamCategory(s) === category).sort((a, b) => a.name.localeCompare(b.name));
  if (!fit.length) return null;
  return fit.find((s) => s.id === currentStreamId)?.id ?? fit[0].id;
}
