import "server-only";
import { prisma } from "@/lib/db";
import { activityAverage, summaryRow } from "@/lib/cbc";
import { gradeFor } from "@/lib/exams/engine";

export type Basis = { score: number | null; grade: string | null; label: string };

/** Mean of the subjects' totals, ignoring blanks; null when nothing was assessed. */
export function meanTotal(totals: (number | null)[]): number | null {
  const v = totals.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

/**
 * The score each student's comment is based on, matching what the report card prints:
 * O-Level end-of-term (competency format) → average of the subject totals (out of 20 + EOT out of 80);
 * any other exam → the exam average.
 */
export async function commentBasis(examId: string, studentIds: string[]): Promise<Map<string, Basis>> {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { examType: true, term: true } });
  const school = await prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { reportTemplate: true } });
  const cbc = (school?.reportTemplate as { cbcOLevel?: boolean } | null)?.cbcOLevel !== false && exam.examType.code === "EOT";
  const [results, oScale] = await Promise.all([
    prisma.examResult.findMany({ where: { examId, studentId: { in: studentIds } }, include: { student: { include: { schoolClass: true } } } }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ALL", isDefault: true }, include: { bands: true } }),
  ]);
  const bands = (oScale?.bands ?? []).map((x) => ({ grade: x.grade, minScore: Number(x.minScore), maxScore: Number(x.maxScore), points: Number(x.points), remark: x.remark }));
  const out = new Map<string, Basis>();
  for (const r of results) out.set(r.studentId, { score: Number(r.average), grade: r.student.schoolClass.level === "O_LEVEL" ? gradeFor(Number(r.average), bands)?.grade ?? null : null, label: "Exam average" });

  const cbcIds = cbc ? results.filter((r) => r.student.schoolClass.level === "O_LEVEL").map((r) => r.studentId) : [];
  if (cbcIds.length) {
    const yearId = exam.term.academicYearId;
    const students = await prisma.student.findMany({
      where: { id: { in: cbcIds } },
      include: {
        enrollments: { where: { academicYearId: yearId } },
        subjects: { where: { academicYearId: yearId } },
        activityScores: { where: { activity: { termId: exam.termId } } },
        subjectResults: { where: { examId } },
      },
    });
    const activities = await prisma.learningActivity.findMany({ where: { termId: exam.termId } });
    for (const st of students) {
      const classId = st.enrollments[0]?.classId ?? st.classId;
      const taken = new Set(st.subjects.map((x) => x.subjectId));
      const acts = activities.filter((a) => a.classId === classId && taken.has(a.subjectId));
      const scoreOf = new Map(st.activityScores.map((x) => [x.activityId, Number(x.score)]));
      const subjectIds = [...new Set([...st.subjectResults.map((r) => r.subjectId), ...acts.map((a) => a.subjectId)])].filter((id) => taken.has(id));
      const totals = subjectIds.map((sid) => {
        const sr = st.subjectResults.find((r) => r.subjectId === sid);
        const mine = acts.filter((a) => a.subjectId === sid);
        return summaryRow({ hasActivities: mine.length > 0, activityAvg: activityAverage(mine.map((a) => scoreOf.get(a.id) ?? null)), eotScore: sr?.percentage != null ? Number(sr.percentage) : null, eotMax: 100 }).total;
      });
      const score = meanTotal(totals);
      out.set(st.id, { score, grade: score === null ? null : gradeFor(score, bands)?.grade ?? null, label: "Average of subject totals (/20 + EOT/80)" });
    }
  }
  return out;
}
