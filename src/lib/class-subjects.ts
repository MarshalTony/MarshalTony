/** How O-Level subjects are taken in each class (unit-tested). */

export type SubjectStatus = "COMPULSORY" | "OPTIONAL" | "NOT_OFFERED";
export const STATUS_LABEL: Record<SubjectStatus, string> = { COMPULSORY: "Compulsory", OPTIONAL: "Optional", NOT_OFFERED: "Not offered" };

/** The subject's status in a class: the class setting if there is one, otherwise from the subject's category. */
export function effectiveStatus(category: string, override: SubjectStatus | null | undefined): SubjectStatus {
  if (override) return override;
  return category === "COMPULSORY" ? "COMPULSORY" : "OPTIONAL";
}

/**
 * What to change in one student's subjects so they follow the class rules:
 * add every compulsory subject they lack; drop subjects not offered in the class (only those without marks).
 * Optional subjects are the student's choice and are left alone.
 */
export function subjectFixes(taken: string[], status: Map<string, SubjectStatus>, withMarks: Set<string> = new Set()) {
  const have = new Set(taken);
  const add = [...status].filter(([id, s]) => s === "COMPULSORY" && !have.has(id)).map(([id]) => id);
  const notOffered = taken.filter((id) => status.get(id) === "NOT_OFFERED");
  return { add, remove: notOffered.filter((id) => !withMarks.has(id)), keptWithMarks: notOffered.filter((id) => withMarks.has(id)) };
}
