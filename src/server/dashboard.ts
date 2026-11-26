import "server-only";
import { prisma } from "@/lib/db";
import { setupItems } from "@/lib/dashboard";
import { progressOf, type Progress } from "@/lib/exams/progress";

/** Administrator's set-up checklist (counts from the live data). */
export async function loadSetupChecklist() {
  const [year, term, school] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
    prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { headteacherName: true, headSignatureFileId: true } }),
  ]);
  const yearId = year?.id ?? "-";
  const [students, allocations, teachersWithoutLogin, streamsWithoutClassTeacher, oLevelClasses, chapterClasses, examsThisTerm, studentsWithoutSubjects, lastBackup] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.teacherAllocation.count({ where: { academicYearId: yearId } }),
    prisma.staff.count({ where: { userId: null, status: { not: "EXITED" }, allocations: { some: { academicYearId: yearId } } } }),
    prisma.stream.count({ where: { isActive: true, classTeacherId: null, students: { some: { status: "ACTIVE" } } } }),
    prisma.schoolClass.findMany({ where: { level: "O_LEVEL", isActive: true, students: { some: { status: "ACTIVE" } } }, select: { id: true } }),
    term ? prisma.learningActivity.findMany({ where: { termId: term.id }, distinct: ["classId"], select: { classId: true } }) : Promise.resolve([]),
    term ? prisma.exam.count({ where: { termId: term.id } }) : Promise.resolve(0),
    prisma.student.count({ where: { status: "ACTIVE", subjects: { none: { academicYearId: yearId } } } }),
    prisma.auditLog.findFirst({ where: { action: "BACKUP_DOWNLOAD" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const withChapters = new Set(chapterClasses.map((c) => c.classId));
  return setupItems({
    currentTerm: !!term, students, allocations, teachersWithoutLogin, streamsWithoutClassTeacher,
    headName: !!school?.headteacherName, headSignature: !!school?.headSignatureFileId,
    oLevelClassesWithoutChapters: oLevelClasses.filter((c) => !withChapters.has(c.id)).length,
    examsThisTerm, studentsWithoutSubjects,
    daysSinceBackup: lastBackup ? Math.floor((Date.now() - lastBackup.createdAt.getTime()) / 86400_000) : null,
  });
}

export type SheetRow = {
  subjectId: string; subject: string; streamId: string; stream: string; oLevel: boolean; learners: number;
  exams: { examId: string; name: string; done: number; expected: number; state: Progress }[];
  activities: { chapters: number; done: number; expected: number; state: Progress } | null;
};

/**
 * A teacher's mark sheets this term: for every allocated subject × stream, marks entered for each exam of the term
 * (learners × papers) and, for S1–S4, Activities of Integration scored (chapters × learners).
 */
export async function loadTeacherSheets(staffId: string): Promise<{ rows: SheetRow[]; termName: string | null }> {
  const term = await prisma.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  if (!term) return { rows: [], termName: null };
  const allocs = await prisma.teacherAllocation.findMany({
    where: { staffId, academicYearId: term.academicYearId },
    include: { subject: true, stream: { include: { schoolClass: true } } },
    orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { stream: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  if (!allocs.length) return { rows: [], termName: `${term.name} ${term.academicYear.name}` };
  const streamIds = [...new Set(allocs.map((a) => a.streamId))], subjectIds = [...new Set(allocs.map((a) => a.subjectId))];
  const [takes, exams, marks, chapters, scores] = await Promise.all([
    prisma.studentSubject.findMany({ where: { academicYearId: term.academicYearId, subjectId: { in: subjectIds }, student: { status: "ACTIVE", streamId: { in: streamIds } } }, select: { subjectId: true, studentId: true, student: { select: { streamId: true } } } }),
    prisma.exam.findMany({ where: { termId: term.id, isComposite: false }, include: { classes: true, subjects: true, examType: true }, orderBy: [{ examType: { order: "asc" } }, { createdAt: "asc" }] }),
    prisma.mark.findMany({ where: { exam: { termId: term.id }, subjectId: { in: subjectIds }, student: { status: "ACTIVE", streamId: { in: streamIds } } }, select: { examId: true, subjectId: true, paper: true, student: { select: { streamId: true } } } }),
    prisma.learningActivity.findMany({ where: { termId: term.id, subjectId: { in: subjectIds } }, select: { id: true, classId: true, subjectId: true } }),
    prisma.activityScore.findMany({ where: { activity: { termId: term.id, subjectId: { in: subjectIds } }, student: { status: "ACTIVE", streamId: { in: streamIds } } }, select: { activityId: true, student: { select: { streamId: true } } } }),
  ]);
  const learnersOf = (subjectId: string, streamId: string) => takes.filter((t) => t.subjectId === subjectId && t.student.streamId === streamId).length;
  const rows: SheetRow[] = allocs.map((a) => {
    const learners = learnersOf(a.subjectId, a.streamId);
    const papers = Math.max(1, a.subject.paperCount);
    const oLevel = a.stream.schoolClass.level === "O_LEVEL";
    const examRows = exams
      .filter((e) => e.classes.some((c) => c.classId === a.stream.classId) && e.subjects.some((s) => s.classId === a.stream.classId && s.subjectId === a.subjectId))
      .map((e) => {
        const done = marks.filter((m) => m.examId === e.id && m.subjectId === a.subjectId && m.student.streamId === a.streamId && m.paper <= papers).length;
        const expected = learners * papers;
        return { examId: e.id, name: e.name, done: Math.min(done, expected), expected, state: progressOf(done, expected) };
      });
    let activities: SheetRow["activities"] = null;
    if (oLevel) {
      const ch = chapters.filter((c) => c.classId === a.stream.classId && c.subjectId === a.subjectId);
      const ids = new Set(ch.map((c) => c.id));
      const done = scores.filter((x) => ids.has(x.activityId) && x.student.streamId === a.streamId).length;
      const expected = ch.length * learners;
      activities = { chapters: ch.length, done: Math.min(done, expected), expected, state: learners === 0 ? "na" : ch.length === 0 ? "none" : progressOf(done, expected) };
    }
    return { subjectId: a.subjectId, subject: a.subject.name, streamId: a.streamId, stream: `${a.stream.schoolClass.code} ${a.stream.name}`, oLevel, learners, exams: examRows, activities };
  });
  return { rows, termName: `${term.name} ${term.academicYear.name}` };
}

/** For a class teacher: per stream, learners, how many reported this term, and comments still to write for the latest exam. */
export async function loadClassTeacher(staffId: string) {
  const term = await prisma.term.findFirst({ where: { isCurrent: true } });
  const streams = await prisma.stream.findMany({ where: { classTeacherId: staffId, isActive: true }, include: { schoolClass: true } });
  if (!streams.length) return [];
  const latest = term ? await prisma.exam.findFirst({ where: { termId: term.id, isComposite: false, classes: { some: { classId: { in: streams.map((s) => s.classId) } } } }, orderBy: { createdAt: "desc" } }) : null;
  return Promise.all(streams.map(async (s) => {
    const [learners, reported, comments] = await Promise.all([
      prisma.student.count({ where: { streamId: s.id, status: "ACTIVE" } }),
      term ? prisma.student.count({ where: { streamId: s.id, status: "ACTIVE", confirmations: { some: { termId: term.id } } } }) : Promise.resolve(0),
      latest ? prisma.reportComment.count({ where: { examId: latest.id, student: { streamId: s.id, status: "ACTIVE" }, classTeacherComment: { not: null } } }) : Promise.resolve(0),
    ]);
    return { streamId: s.id, classId: s.classId, name: `${s.schoolClass.code} ${s.name}`, learners, reported, comments, exam: latest ? { id: latest.id, name: latest.name } : null };
  }));
}
