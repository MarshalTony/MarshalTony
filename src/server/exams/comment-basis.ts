import "server-only";
import { reportScores } from "./report-scores";
export { meanTotal } from "./report-scores";

export type Basis = { score: number | null; grade: string | null; label: string };

/** The score each student's comments are based on: their average across ALL subjects, as the report card shows them. */
export async function commentBasis(examId: string, studentIds: string[]): Promise<Map<string, Basis>> {
  const rs = await reportScores(examId, studentIds);
  return new Map([...rs.byStudent.entries()].map(([id, s]) => [id, { score: s.average, grade: s.grade, label: rs.label }]));
}
