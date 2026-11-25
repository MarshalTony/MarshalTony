/** Which learners still lack scores for an exam (unit-tested). */

export type Learner = { id: string; name: string; admissionNo: string; streamId: string; classId: string };
export type Missing = { studentId: string; subjectId: string; streamId: string; papers: number[]; chapters: string[] };

/**
 * For every learner × subject they take: the papers with no mark (ABS / EX count as entered) and, for O-Level,
 * the Activities of Integration chapters with no score. Only learners with something missing are returned.
 */
export function missingScores(args: {
  learners: Learner[];
  takes: { studentId: string; subjectId: string }[];
  examSubjects: Set<string>; // `${classId}:${subjectId}` set up in the exam
  paperCount: Map<string, number>;
  marks: { studentId: string; subjectId: string; paper: number }[];
  chapters: { id: string; title: string; classId: string; subjectId: string }[]; // O-Level only
  scored: Set<string>; // `${activityId}:${studentId}`
}): Missing[] {
  const byId = new Map(args.learners.map((l) => [l.id, l]));
  const have = new Set(args.marks.map((m) => `${m.studentId}:${m.subjectId}:${m.paper}`));
  const out: Missing[] = [];
  for (const t of args.takes) {
    const l = byId.get(t.studentId);
    if (!l || !args.examSubjects.has(`${l.classId}:${t.subjectId}`)) continue;
    const n = Math.max(1, args.paperCount.get(t.subjectId) ?? 1);
    const papers = Array.from({ length: n }, (_, i) => i + 1).filter((p) => !have.has(`${t.studentId}:${t.subjectId}:${p}`));
    const chapters = args.chapters.filter((c) => c.classId === l.classId && c.subjectId === t.subjectId && !args.scored.has(`${c.id}:${t.studentId}`)).map((c) => c.title);
    if (papers.length || chapters.length) out.push({ studentId: t.studentId, subjectId: t.subjectId, streamId: l.streamId, papers, chapters });
  }
  return out;
}

/** "Exam mark", "Paper 2", "Papers 1, 2". */
export function papersLabel(missing: number[], paperCount: number): string {
  if (!missing.length) return "";
  if (paperCount <= 1) return "Exam mark";
  return missing.length === 1 ? `Paper ${missing[0]}` : `Papers ${missing.join(", ")}`;
}
