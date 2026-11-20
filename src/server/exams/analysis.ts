import "server-only";
import { prisma } from "@/lib/db";
import { studentName } from "@/lib/utils";
import { reportScores } from "./report-scores";
import {
  atRisk, bottomRanked, changes, genderBySubject, gradeDistribution, mean, rankByAverage, subjectStreamMatrix, teacherPerformance, topRanked,
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
  const [scores, examSubjects, allocations, compareExam] = await Promise.all([
    reportScores(examId, results.map((r) => r.studentId)),
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: exam.term.academicYearId, stream: { classId } }, include: { staff: true } }),
    compareId ? prisma.exam.findUnique({ where: { id: compareId }, include: { term: { include: { academicYear: true } } } }) : null,
  ]);
  // Subject scores as printed on the report card; each student's average is across ALL their subjects.
  const marks: SubjectMark[] = results.flatMap((r) => (scores.byStudent.get(r.studentId)?.subjects ?? []).map((x) => ({
    studentId: r.studentId, subjectId: x.subjectId, streamId: r.streamId, gender: r.student.gender, pct: x.score, grade: x.grade,
  })));
  const students: StudentAvg[] = results.flatMap((r) => {
    const avg = scores.byStudent.get(r.studentId)?.average;
    return avg === null || avg === undefined ? [] : [{ studentId: r.studentId, name: studentName(r.student), streamId: r.streamId, gender: r.student.gender, avg }];
  });

  // Comparison exam, scored the same way (all subjects).
  let prevAvg: Map<string, number> | null = null;
  let prevSubject: Map<string, number> | null = null;
  let prevClassAvg: number | null = null;
  if (compareExam) {
    const prev = await reportScores(compareExam.id, students.map((x) => x.studentId));
    prevAvg = new Map([...prev.byStudent.entries()].flatMap(([id, x]) => (x.average === null ? [] : [[id, x.average] as [string, number]])));
    prevClassAvg = mean([...prevAvg.values()]);
    const bySub = new Map<string, number[]>();
    for (const x of prev.byStudent.values()) for (const sub of x.subjects) bySub.set(sub.subjectId, [...(bySub.get(sub.subjectId) ?? []), sub.score]);
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

  const ranked = rankByAverage(students);
  const withStream = <T extends { streamId: string }>(x: T) => ({ ...x, stream: streamName.get(x.streamId) ?? "" });
  const subjectAvgs = subjects.map((x) => ({ name: x.name, avg: matrix.overall(x.id) })).filter((x) => x.avg !== null) as { name: string; avg: number }[];
  subjectAvgs.sort((a, b) => b.avg - a.avg);
  const streamAvgs = streams.map((st) => ({ name: `${cls.code} ${st.name}`, avg: mean(students.filter((x) => x.streamId === st.id).map((x) => x.avg)) })).filter((x) => x.avg !== null) as { name: string; avg: number }[];
  streamAvgs.sort((a, b) => b.avg - a.avg);

  return {
    exam, cls, compareExam, opts, scoreLabel: scores.label,
    rankings: {
      winners: ranked.filter((r) => r.position === 1).map(withStream),
      bestClass: topRanked(ranked, 10).map(withStream),
      lastClass: bottomRanked(ranked, 10).map(withStream),
      byStream: streams.map((st) => {
        const inStream = rankByAverage(students.filter((x) => x.streamId === st.id));
        const classPos = new Map(ranked.map((r) => [r.studentId, r.position]));
        const add = (r: (typeof inStream)[number]) => ({ ...r, classPosition: classPos.get(r.studentId) ?? null });
        return { id: st.id, name: `${cls.code} ${st.name}`, best: topRanked(inStream, 10).map(add), last: bottomRanked(inStream, 3).map(add) };
      }),
    },
    highlights: {
      bestSubject: subjectAvgs[0] ?? null,
      weakestSubject: subjectAvgs.length > 1 ? subjectAvgs[subjectAvgs.length - 1] : null,
      bestStream: streamAvgs.length > 1 ? streamAvgs[0] : null,
    },
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
