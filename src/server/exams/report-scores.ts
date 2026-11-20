import "server-only";
import { prisma } from "@/lib/db";
import { activityAverage, summaryRow } from "@/lib/cbc";
import { gradeFor } from "@/lib/exams/engine";

export type SubjectScore = { subjectId: string; score: number; grade: string | null };
export type StudentScores = { subjects: SubjectScore[]; average: number | null; grade: string | null };
export type ReportScores = { mode: "cbc" | "exam"; label: string; byStudent: Map<string, StudentScores> };

/** Mean of the subject scores (all subjects, blanks ignored), one decimal; null when nothing was assessed. */
export function meanTotal(totals: (number | null)[]): number | null {
  const v = totals.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/**
 * Each student's score per subject as the report card shows it, and their average across ALL subjects:
 * O-Level end-of-term (competency card) → subject total = activities out of 20 + EOT out of 80;
 * any other exam / level → the subject percentage. Used by report-card comments and results analysis.
 */
export async function reportScores(examId: string, studentIds: string[]): Promise<ReportScores> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { examType: true, term: true } });
  const school = await prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { reportTemplate: true } });
  const cbcOn = (school?.reportTemplate as { cbcOLevel?: boolean } | null)?.cbcOLevel !== false && exam.examType.code === "EOT";
  const yearId = exam.term.academicYearId;
  const [students, oScale, activities] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        schoolClass: true,
        enrollments: { where: { academicYearId: yearId }, include: { schoolClass: true } },
        subjects: { where: { academicYearId: yearId } },
        activityScores: cbcOn ? { where: { activity: { termId: exam.termId } } } : false,
        subjectResults: { where: { examId } },
      },
    }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ALL", isDefault: true }, include: { bands: true } }),
    cbcOn ? prisma.learningActivity.findMany({ where: { termId: exam.termId } }) : Promise.resolve([]),
  ]);
  const bands = (oScale?.bands ?? []).map((x) => ({ grade: x.grade, minScore: Number(x.minScore), maxScore: Number(x.maxScore), points: Number(x.points), remark: x.remark }));
  const byStudent = new Map<string, StudentScores>();
  let anyCbc = false;
  for (const st of students) {
    const level = st.enrollments[0]?.schoolClass.level ?? st.schoolClass.level;
    let subjects: SubjectScore[];
    if (cbcOn && level === "O_LEVEL") {
      anyCbc = true;
      const classId = st.enrollments[0]?.classId ?? st.classId;
      const taken = new Set(st.subjects.map((x) => x.subjectId));
      const acts = activities.filter((a) => a.classId === classId && taken.has(a.subjectId));
      const scoreOf = new Map(((st as any).activityScores as { activityId: string; score: unknown }[]).map((x) => [x.activityId, Number(x.score)]));
      const ids = [...new Set([...st.subjectResults.map((r) => r.subjectId), ...acts.map((a) => a.subjectId)])].filter((id) => taken.has(id));
      subjects = ids.flatMap((sid) => {
        const sr = st.subjectResults.find((r) => r.subjectId === sid);
        const mine = acts.filter((a) => a.subjectId === sid);
        const total = summaryRow({ hasActivities: mine.length > 0, activityAvg: activityAverage(mine.map((a) => scoreOf.get(a.id) ?? null)), eotScore: sr?.percentage != null ? Number(sr.percentage) : null, eotMax: 100 }).total;
        return total === null ? [] : [{ subjectId: sid, score: total, grade: gradeFor(total, bands)?.grade ?? null }];
      });
    } else {
      subjects = st.subjectResults.filter((r) => r.percentage !== null).map((r) => ({ subjectId: r.subjectId, score: Number(r.percentage), grade: r.grade }));
    }
    const average = meanTotal(subjects.map((x) => x.score));
    byStudent.set(st.id, { subjects, average, grade: average !== null && level === "O_LEVEL" ? gradeFor(average, bands)?.grade ?? null : null });
  }
  return {
    mode: anyCbc ? "cbc" : "exam",
    label: anyCbc ? "average of all subjects' totals (/20 + EOT/80)" : "average of all subjects (%)",
    byStudent,
  };
}
