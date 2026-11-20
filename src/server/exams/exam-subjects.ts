import "server-only";
import { prisma, type Tx } from "@/lib/db";

type Sub = { classId: string; maxMarks: unknown };

/**
 * Usual maximum mark for a level in an exam: the most common maximum already used by that level's subjects
 * (e.g. O-Level EOT 80); A-Level defaults to 100 (no activities); otherwise the exam's most common maximum, else 100.
 */
export function usualMax(subjects: Sub[], levelOf: Map<string, string>, level: string): number {
  const mode = (list: Sub[]) => {
    const counts = new Map<number, number>();
    for (const s of list) counts.set(Number(s.maxMarks), (counts.get(Number(s.maxMarks)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const same = mode(subjects.filter((s) => levelOf.get(s.classId) === level));
  if (same) return same;
  if (level === "A_LEVEL") return 100;
  return mode(subjects) ?? 100;
}

/**
 * Keeps an exam's subjects in step with its classes: every subject that active students of an exam class take
 * this year is added (with the usual maximum for the level). Nothing is removed. Needed because students and
 * subjects are often registered or imported after the exam was created. Returns the number of subjects added.
 */
export async function syncExamSubjects(examId: string, db: Tx | typeof prisma = prisma): Promise<number> {
  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: { isComposite: true, term: { select: { academicYearId: true } }, classes: { select: { classId: true, schoolClass: { select: { level: true } } } }, subjects: { select: { classId: true, subjectId: true, maxMarks: true } } },
  });
  if (!exam || !exam.classes.length) return 0;
  const levelOf = new Map(exam.classes.map((c) => [c.classId, c.schoolClass.level as string]));
  const have = new Set(exam.subjects.map((s) => `${s.classId}:${s.subjectId}`));
  const taken = await db.studentSubject.findMany({
    where: { academicYearId: exam.term.academicYearId, student: { status: "ACTIVE", classId: { in: exam.classes.map((c) => c.classId) } } },
    distinct: ["subjectId", "studentId"],
    select: { subjectId: true, student: { select: { classId: true } } },
  });
  const missing = new Map<string, { classId: string; subjectId: string }>();
  for (const t of taken) {
    const key = `${t.student.classId}:${t.subjectId}`;
    if (!have.has(key)) missing.set(key, { classId: t.student.classId, subjectId: t.subjectId });
  }
  if (!missing.size) return 0;
  const data = [...missing.values()].map((m) => ({
    examId, classId: m.classId, subjectId: m.subjectId,
    maxMarks: exam.isComposite ? 100 : usualMax(exam.subjects, levelOf, levelOf.get(m.classId) ?? "O_LEVEL"),
  }));
  const { count } = await db.examSubject.createMany({ data, skipDuplicates: true });
  return count;
}
