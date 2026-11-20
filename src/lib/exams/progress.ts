/** Report-readiness counting rules (pure; used by the readiness page). */
export type Progress = "complete" | "partial" | "none" | "na";

/** "na" when nothing is expected (no students take it); otherwise none / partial / complete. */
export function progressOf(done: number, expected: number): Progress {
  if (expected <= 0) return "na";
  if (done <= 0) return "none";
  return done >= expected ? "complete" : "partial";
}

export const pctOf = (done: number, expected: number) => (expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : 100);

/**
 * Activities of Integration for one subject in one stream: complete when the subject has at least one chapter
 * and every learner has a score for every chapter. Expected = chapters × learners.
 */
export function activityProgress(chapters: number, learners: number, scores: number): { done: number; expected: number; state: Progress } {
  if (learners <= 0) return { done: 0, expected: 0, state: "na" };
  if (chapters <= 0) return { done: 0, expected: learners, state: "none" }; // no chapter added yet
  const expected = chapters * learners;
  return { done: Math.min(scores, expected), expected, state: progressOf(scores, expected) };
}
