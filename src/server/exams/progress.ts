import "server-only";
import { prisma } from "@/lib/db";
import { activityProgress, progressOf, type Progress } from "@/lib/exams/progress";

export type SubjectRow = {
  classId: string; streamId: string; subjectId: string; subject: string; teachers: string[];
  learners: number; marks: number; marksState: Progress;
  chapters: number | null; actDone: number; actExpected: number; actState: Progress; // chapters null = A-Level (no activities)
};
export type StreamComments = { streamId: string; learners: number; classTeacher: number; headteacher: number; classTeacherName: string | null };

/**
 * Report readiness for one exam: per class × stream × subject, how many marks are entered (of the learners taking
 * the subject), and for S1–S4 the Activities of Integration (chapters × learners); per stream, comments written.
 */
export async function loadProgress(examId: string) {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { term: { include: { academicYear: true } }, classes: { include: { schoolClass: { include: { streams: { where: { isActive: true }, orderBy: { name: "asc" }, include: { classTeacher: true } } } } } }, subjects: { include: { subject: true } } },
  });
  const yearId = exam.term.academicYearId;
  const classIds = exam.classes.map((c) => c.classId);
  const [taking, marks, activities, scores, comments, allocations] = await Promise.all([
    prisma.studentSubject.findMany({ where: { academicYearId: yearId, student: { status: "ACTIVE", classId: { in: classIds } } }, select: { subjectId: true, studentId: true, student: { select: { streamId: true } } } }),
    prisma.mark.findMany({ where: { examId }, select: { subjectId: true, studentId: true } }),
    prisma.learningActivity.findMany({ where: { termId: exam.termId, classId: { in: classIds } }, select: { id: true, classId: true, subjectId: true } }),
    prisma.activityScore.findMany({ where: { activity: { termId: exam.termId, classId: { in: classIds } }, student: { status: "ACTIVE" } }, select: { activityId: true, studentId: true } }),
    prisma.reportComment.findMany({ where: { examId }, select: { studentId: true, classTeacherComment: true, headteacherComment: true } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: yearId, stream: { classId: { in: classIds } } }, include: { staff: true } }),
  ]);
  const streamOf = new Map(taking.map((t) => [t.studentId, t.student.streamId]));
  const activeInStream = new Map<string, Set<string>>();
  for (const t of taking) { const set = activeInStream.get(t.student.streamId) ?? new Set(); set.add(t.studentId); activeInStream.set(t.student.streamId, set); }
  const count = new Map<string, number>(); // key → number
  const inc = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  for (const t of taking) inc(`take:${t.subjectId}:${t.student.streamId}`);
  const takers = new Set(taking.map((t) => `${t.studentId}:${t.subjectId}`));
  for (const m of marks) if (takers.has(`${m.studentId}:${m.subjectId}`)) inc(`mark:${m.subjectId}:${streamOf.get(m.studentId)}`);
  const actById = new Map(activities.map((a) => [a.id, a]));
  for (const a of activities) inc(`chap:${a.classId}:${a.subjectId}`);
  for (const s of scores) {
    const a = actById.get(s.activityId); const st = streamOf.get(s.studentId);
    if (a && st && takers.has(`${s.studentId}:${a.subjectId}`)) inc(`ascore:${a.subjectId}:${st}`);
  }
  const teacherOf = new Map<string, string[]>();
  for (const a of allocations) { const k = `${a.subjectId}:${a.streamId}`; teacherOf.set(k, [...(teacherOf.get(k) ?? []), `${a.staff.lastName} ${a.staff.firstName}`]); }

  const classes = exam.classes.sort((a, b) => a.schoolClass.order - b.schoolClass.order).map(({ schoolClass: c }) => {
    const oLevel = c.level === "O_LEVEL";
    const subs = exam.subjects.filter((s) => s.classId === c.id).sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    const rows: SubjectRow[] = c.streams.flatMap((st) => subs.map((es) => {
      const learners = count.get(`take:${es.subjectId}:${st.id}`) ?? 0;
      const m = count.get(`mark:${es.subjectId}:${st.id}`) ?? 0;
      const chapters = oLevel ? count.get(`chap:${c.id}:${es.subjectId}`) ?? 0 : null;
      const act = chapters === null ? { done: 0, expected: 0, state: "na" as Progress } : activityProgress(chapters, learners, count.get(`ascore:${es.subjectId}:${st.id}`) ?? 0);
      return {
        classId: c.id, streamId: st.id, subjectId: es.subjectId, subject: es.subject.name, teachers: teacherOf.get(`${es.subjectId}:${st.id}`) ?? [],
        learners, marks: Math.min(m, learners), marksState: progressOf(m, learners),
        chapters, actDone: act.done, actExpected: act.expected, actState: act.state,
      };
    })).filter((r) => r.learners > 0);
    const streamComments: StreamComments[] = c.streams.map((st) => {
      const ids = activeInStream.get(st.id) ?? new Set<string>();
      const mine = comments.filter((x) => ids.has(x.studentId));
      return {
        streamId: st.id, learners: ids.size, classTeacherName: st.classTeacher ? `${st.classTeacher.lastName} ${st.classTeacher.firstName}` : null,
        classTeacher: mine.filter((x) => x.classTeacherComment?.trim()).length, headteacher: mine.filter((x) => x.headteacherComment?.trim()).length,
      };
    });
    return { id: c.id, name: c.name, code: c.code, oLevel, streams: c.streams.map((s) => ({ id: s.id, name: s.name })), rows, comments: streamComments };
  });

  // Totals and the teachers with outstanding work.
  const all = classes.flatMap((c) => c.rows);
  const sum = (f: (r: SubjectRow) => number) => all.reduce((a, r) => a + f(r), 0);
  const allComments = classes.flatMap((c) => c.comments);
  const totals = {
    marks: { done: sum((r) => r.marks), expected: sum((r) => r.learners) },
    activities: { done: sum((r) => r.actDone), expected: sum((r) => r.actExpected), missingChapters: all.filter((r) => r.chapters === 0).length },
    classTeacher: { done: allComments.reduce((a, x) => a + x.classTeacher, 0), expected: allComments.reduce((a, x) => a + x.learners, 0) },
    headteacher: { done: allComments.reduce((a, x) => a + x.headteacher, 0), expected: allComments.reduce((a, x) => a + x.learners, 0) },
  };
  const streamLabel = new Map(classes.flatMap((c) => c.streams.map((s) => [s.id, `${c.code} ${s.name}`])));
  const owed = new Map<string, { teacher: string; items: string[] }>();
  for (const r of all) {
    const missing: string[] = [];
    if (r.marksState !== "complete") missing.push(`${r.learners - r.marks} mark(s) missing`);
    if (r.actState === "none" && r.chapters === 0) missing.push("no activity chapters");
    else if (r.actState === "partial" || r.actState === "none") missing.push(`${r.actExpected - r.actDone} activity score(s) missing`);
    if (!missing.length) continue;
    for (const t of r.teachers.length ? r.teachers : ["(no teacher allocated)"]) {
      const e = owed.get(t) ?? { teacher: t, items: [] };
      e.items.push(`${r.subject} ${streamLabel.get(r.streamId)}: ${missing.join(", ")}`);
      owed.set(t, e);
    }
  }
  return { exam, classes, totals, teachersOwing: [...owed.values()].sort((a, b) => b.items.length - a.items.length || a.teacher.localeCompare(b.teacher)) };
}
export type ProgressData = Awaited<ReturnType<typeof loadProgress>>;
