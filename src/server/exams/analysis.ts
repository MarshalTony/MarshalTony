import "server-only";
import { prisma } from "@/lib/db";
import { studentName } from "@/lib/utils";
import {
  atRisk, changes, genderBySubject, gradeDistribution, mean, subjectStreamMatrix, teacherPerformance,
  type StudentAvg, type SubjectMark,
} from "@/lib/exams/analysis";

export type AnalysisOptions = { passMark: number; failLimit: number; dropLimit: number };
export const DEFAULT_OPTIONS: AnalysisOptions = { passMark: 50, failLimit: 3, dropLimit: 10 };

/** Exams with generated results for this class, other than `examId` (newest first) — choices for "compare with". */
export async function comparableExams(examId: string, classId: string) {
  return prisma.exam.findMany({
    where: { id: { not: examId }, resultsGeneratedAt: { not: null }, results: { some: { classId } } },
    include: { term: { include: { academicYear: true } } },
    orderBy: [{ term: { startDate: "desc" } }, { createdAt: "desc" }],
  });
}

/** Everything the analysis page and PDF show for one exam × class. */
export async function loadAnalysis(examId: string, classId: string, compareId: string | null, opts: AnalysisOptions) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: { include: { academicYear: true } } } });
  const cls = await prisma.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { streams: { orderBy: { name: "asc" } } } });
  const results = await prisma.examResult.findMany({ where: { examId, classId }, include: { student: true } });
  const [subjectResults, examSubjects, allocations, compareExam] = await Promise.all([
    prisma.subjectResult.findMany({ where: { examId, studentId: { in: results.map((r) => r.studentId) }, percentage: { not: null } } }),
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: exam.term.academicYearId, stream: { classId } }, include: { staff: true } }),
    compareId ? prisma.exam.findUnique({ where: { id: compareId }, include: { term: { include: { academicYear: true } } } }) : null,
  ]);
  const streamOf = new Map(results.map((r) => [r.studentId, r.streamId]));
  const genderOf = new Map(results.map((r) => [r.studentId, r.student.gender]));
  const marks: SubjectMark[] = subjectResults.filter((s) => streamOf.has(s.studentId)).map((s) => ({
    studentId: s.studentId, subjectId: s.subjectId, streamId: streamOf.get(s.studentId)!, gender: genderOf.get(s.studentId)!, pct: Number(s.percentage), grade: s.grade,
  }));
  const students: StudentAvg[] = results.filter((r) => r.subjectsCount > 0).map((r) => ({ studentId: r.studentId, name: studentName(r.student), streamId: r.streamId, gender: r.student.gender, avg: Number(r.average) }));

  // Comparison exam: student averages and subject averages (same class).
  let prevAvg: Map<string, number> | null = null;
  let prevSubject: Map<string, number> | null = null;
  let prevClassAvg: number | null = null;
  if (compareExam) {
    const [pr, ps] = await Promise.all([
      prisma.examResult.findMany({ where: { examId: compareExam.id, studentId: { in: students.map((s) => s.studentId) }, subjectsCount: { gt: 0 } } }),
      prisma.subjectResult.findMany({ where: { examId: compareExam.id, studentId: { in: students.map((s) => s.studentId) }, percentage: { not: null } } }),
    ]);
    prevAvg = new Map(pr.map((r) => [r.studentId, Number(r.average)]));
    prevClassAvg = mean(pr.map((r) => Number(r.average)));
    const bySub = new Map<string, number[]>();
    for (const s of ps) bySub.set(s.subjectId, [...(bySub.get(s.subjectId) ?? []), Number(s.percentage)]);
    prevSubject = new Map([...bySub.entries()].map(([k, v]) => [k, mean(v)!]));
  }

  const matrix = subjectStreamMatrix(marks);
  const teacherNames = new Map<string, string[]>();
  for (const a of allocations) {
    const k = `${a.subjectId}:${a.streamId}`;
    teacherNames.set(k, [...(teacherNames.get(k) ?? []), `${a.staff.lastName} ${a.staff.firstName}`]);
  }
  const streamName = new Map(cls.streams.map((s) => [s.id, s.name]));
  const subjects = examSubjects.map((e) => e.subject).filter((s) => matrix.sat(s.id) > 0);
  const streams = cls.streams.filter((s) => students.some((x) => x.streamId === s.id));
  const ch = prevAvg ? changes(students, prevAvg) : [];

  return {
    exam, cls, compareExam, opts,
    streams: streams.map((s) => ({ id: s.id, name: s.name })),
    summary: {
      candidates: students.length,
      classAvg: mean(students.map((s) => s.avg)),
      prevClassAvg,
      passRate: students.length ? Math.round((students.filter((s) => s.avg >= opts.passMark).length / students.length) * 1000) / 10 : null,
      boysAvg: mean(students.filter((s) => s.gender === "MALE").map((s) => s.avg)),
      girlsAvg: mean(students.filter((s) => s.gender === "FEMALE").map((s) => s.avg)),
      streamAvg: streams.map((s) => ({ id: s.id, name: s.name, avg: mean(students.filter((x) => x.streamId === s.id).map((x) => x.avg)), n: students.filter((x) => x.streamId === s.id).length })),
      grades: gradeDistribution(marks),
    },
    subjects: subjects.map((s) => {
      const overall = matrix.overall(s.id);
      const prev = prevSubject?.get(s.id) ?? null;
      return {
        id: s.id, name: s.name, code: s.shortName || s.code, sat: matrix.sat(s.id), overall, prev,
        delta: overall !== null && prev !== null ? Math.round((overall - prev) * 10) / 10 : null,
        ...genderBySubject(marks, s.id),
        byStream: streams.map((st) => ({ streamId: st.id, avg: matrix.cell(s.id, st.id), n: matrix.count(s.id, st.id), teachers: teacherNames.get(`${s.id}:${st.id}`) ?? [] })),
      };
    }).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)),
    teachers: teacherPerformance(marks, teacherNames).map((t) => ({
      ...t,
      teaches: t.cells.map((k) => { const [sid, stid] = k.split(":"); return `${subjects.find((x) => x.id === sid)?.shortName || subjects.find((x) => x.id === sid)?.code || "?"} ${cls.code}${streamName.get(stid) ?? ""}`; }).join(", "),
    })),
    improved: ch.filter((c) => c.delta > 0).slice(0, 10).map((c) => ({ ...c, stream: streamName.get(c.streamId) ?? "" })),
    dropped: [...ch].reverse().filter((c) => c.delta < 0).slice(0, 10).map((c) => ({ ...c, stream: streamName.get(c.streamId) ?? "" })),
    risk: atRisk(students, marks, prevAvg, opts).map((r) => ({ ...r, stream: streamName.get(r.streamId) ?? "" })),
  };
}
export type Analysis = Awaited<ReturnType<typeof loadAnalysis>>;
