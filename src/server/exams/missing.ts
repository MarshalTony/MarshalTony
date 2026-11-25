import "server-only";
import { prisma } from "@/lib/db";
import { missingScores } from "@/lib/missing-scores";
import { syncExamSubjects } from "./exam-subjects";
import { studentName } from "@/lib/utils";

export type MissingGroup = {
  classId: string; className: string; classCode: string; oLevel: boolean;
  streamId: string; streamName: string; subjectId: string; subject: string; paperCount: number; teachers: string[];
  learners: { studentId: string; admissionNo: string; name: string; papers: number[]; chapters: string[] }[];
};

/**
 * Learners still missing scores for an exam, grouped by class × stream × subject (same rules as Report readiness:
 * active learners taking a subject set in the exam; every paper needs a mark, ABS or EX; S1–S4 every chapter of the term needs a score).
 */
export async function loadMissing(examId: string, f: { classId?: string | null; streamId?: string | null; subjectId?: string | null }) {
  await syncExamSubjects(examId);
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { term: { include: { academicYear: true } }, classes: { include: { schoolClass: { include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } } } } }, subjects: { include: { subject: true } } },
  });
  const yearId = exam.term.academicYearId;
  const classIds = exam.classes.map((c) => c.classId).filter((id) => !f.classId || id === f.classId);
  const studentWhere = { status: "ACTIVE" as const, classId: { in: classIds }, ...(f.streamId ? { streamId: f.streamId } : {}) };
  const [learners, takes, marks, chapters, scores, allocations] = await Promise.all([
    prisma.student.findMany({ where: studentWhere, select: { id: true, firstName: true, lastName: true, otherNames: true, admissionNo: true, streamId: true, classId: true } }),
    prisma.studentSubject.findMany({ where: { academicYearId: yearId, student: studentWhere, ...(f.subjectId ? { subjectId: f.subjectId } : {}) }, select: { studentId: true, subjectId: true } }),
    prisma.mark.findMany({ where: { examId, student: studentWhere }, select: { studentId: true, subjectId: true, paper: true } }),
    prisma.learningActivity.findMany({ where: { termId: exam.termId, classId: { in: classIds }, schoolClass: { level: "O_LEVEL" } }, select: { id: true, title: true, classId: true, subjectId: true }, orderBy: { order: "asc" } }),
    prisma.activityScore.findMany({ where: { activity: { termId: exam.termId, classId: { in: classIds } }, student: studentWhere }, select: { activityId: true, studentId: true } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: yearId, stream: { classId: { in: classIds } } }, include: { staff: true } }),
  ]);
  const subjectById = new Map(exam.subjects.map((s) => [s.subjectId, s.subject]));
  const missing = missingScores({
    learners: learners.map((l) => ({ id: l.id, name: studentName(l), admissionNo: l.admissionNo, streamId: l.streamId, classId: l.classId })),
    takes,
    examSubjects: new Set(exam.subjects.map((s) => `${s.classId}:${s.subjectId}`)),
    paperCount: new Map(exam.subjects.map((s) => [s.subjectId, s.subject.paperCount])),
    marks, chapters, scored: new Set(scores.map((x) => `${x.activityId}:${x.studentId}`)),
  });
  const learner = new Map(learners.map((l) => [l.id, l]));
  const classOf = new Map(exam.classes.map((c) => [c.classId, c.schoolClass]));
  const groups = new Map<string, MissingGroup>();
  for (const m of missing) {
    const l = learner.get(m.studentId)!;
    const cls = classOf.get(l.classId)!;
    const sub = subjectById.get(m.subjectId)!;
    const key = `${l.classId}:${m.streamId}:${m.subjectId}`;
    if (!groups.has(key)) groups.set(key, {
      classId: l.classId, className: cls.name, classCode: cls.code, oLevel: cls.level === "O_LEVEL",
      streamId: m.streamId, streamName: cls.streams.find((s) => s.id === m.streamId)?.name ?? "", subjectId: m.subjectId, subject: sub.name, paperCount: sub.paperCount,
      teachers: [...new Set(allocations.filter((a) => a.subjectId === m.subjectId && a.streamId === m.streamId).map((a) => `${a.staff.lastName} ${a.staff.firstName}`))],
      learners: [],
    });
    groups.get(key)!.learners.push({ studentId: m.studentId, admissionNo: l.admissionNo, name: studentName(l), papers: m.papers, chapters: m.chapters });
  }
  const order = new Map(exam.classes.map((c) => [c.classId, c.schoolClass.order]));
  const list = [...groups.values()].sort((a, b) => (order.get(a.classId)! - order.get(b.classId)!) || a.streamName.localeCompare(b.streamName) || a.subject.localeCompare(b.subject));
  for (const g of list) g.learners.sort((a, b) => a.name.localeCompare(b.name));
  return {
    exam,
    classes: exam.classes.map((c) => c.schoolClass).sort((a, b) => a.order - b.order),
    subjects: [...new Map(exam.subjects.filter((s) => classIds.includes(s.classId)).map((s) => [s.subjectId, s.subject])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    groups: list,
    totals: { learners: new Set(missing.map((m) => m.studentId)).size, marks: missing.reduce((a, m) => a + m.papers.length, 0), chapters: missing.reduce((a, m) => a + m.chapters.length, 0) },
  };
}
