import "server-only";
import { marksApprovalRequired } from "./approval-setting";
import type { Level } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeResults, compositePercentage, type MarkInput, type Rule, type Scale, type SubjectCategory,
} from "@/lib/exams/engine";
import { UserError } from "../action";

export async function loadScales(level: Level): Promise<Scale[]> {
  const scales = await prisma.gradingScale.findMany({ where: { level, isDefault: true, appliesTo: { not: "ACTIVITY" } }, include: { bands: true } });
  return scales.map((s) => ({
    appliesTo: s.appliesTo,
    bands: s.bands.map((b) => ({ grade: b.grade, minScore: Number(b.minScore), maxScore: Number(b.maxScore), points: Number(b.points), remark: b.remark })),
  }));
}

export async function loadRule(level: Level): Promise<Rule & { topClassCount: number; topStreamCount: number }> {
  const r = await prisma.resultRule.findUnique({ where: { level } });
  return {
    rankingBasis: (r?.rankingBasis ?? "AVERAGE") as Rule["rankingBasis"],
    bestOfSubjects: r?.bestOfSubjects ?? null,
    tieMethod: (r?.tieMethod ?? "COMPETITION") as Rule["tieMethod"],
    absentPolicy: (r?.absentPolicy ?? "EXCLUDE") as Rule["absentPolicy"],
    minSubjectsToRank: r?.minSubjectsToRank ?? 1,
    divisions: Array.isArray(r?.divisions) ? (r!.divisions as Rule["divisions"]) : [],
    topClassCount: r?.topClassCount ?? 12,
    topStreamCount: r?.topStreamCount ?? 3,
  };
}

/**
 * Marks to use for an exam: { studentId → subjectId → mark }.
 * Only stream/subject sets whose submission is APPROVED are used unless includeUnapproved.
 * Composite exams combine their component exams' percentages using the configured weights.
 */
async function effectiveMarks(examId: string, includeUnapproved: boolean) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { components: { include: { componentExam: { include: { subjects: true } } } } } });
  const out = new Map<string, Map<string, MarkInput>>();
  const maxOverride = new Map<string, number>(); // `${classId}:${subjectId}` -> max (100 for composites)

  /** Marks with the class/stream the student was enrolled in during that exam's year. */
  async function rawMarks(id: string) {
    const ex = await prisma.exam.findUniqueOrThrow({ where: { id }, select: { term: { select: { academicYearId: true } } } });
    const approved = includeUnapproved ? null : await prisma.markSubmission.findMany({ where: { examId: id, status: "APPROVED" }, select: { streamId: true, subjectId: true } });
    const ok = approved ? new Set(approved.map((a) => `${a.streamId}:${a.subjectId}`)) : null;
    const marks = await prisma.mark.findMany({
      where: { examId: id },
      include: { student: { select: { streamId: true, classId: true, enrollments: { where: { academicYearId: ex.term.academicYearId }, select: { classId: true, streamId: true } } } } },
    });
    return marks
      .map((m) => ({ ...m, streamId: m.student.enrollments[0]?.streamId ?? m.student.streamId, classId: m.student.enrollments[0]?.classId ?? m.student.classId }))
      .filter((m) => !ok || ok.has(`${m.streamId}:${m.subjectId}`));
  }

  if (!exam.isComposite) {
    for (const m of await rawMarks(examId)) {
      if (!out.has(m.studentId)) out.set(m.studentId, new Map());
      out.get(m.studentId)!.set(m.subjectId, { score: m.score === null ? null : Number(m.score), status: m.status });
    }
    return { marks: out, maxOverride };
  }

  if (!exam.components.length) throw new UserError("This combined exam has no component exams configured.");
  const parts = await Promise.all(
    exam.components.map(async (c) => {
      const marks = await rawMarks(c.componentExamId);
      const classOf = new Map(marks.map((m) => [m.studentId, m.classId]));
      const max = new Map(c.componentExam.subjects.map((s) => [`${s.classId}:${s.subjectId}`, Number(s.maxMarks)]));
      const byStudent = new Map<string, Map<string, { mark: MarkInput; max: number }>>();
      for (const m of marks) {
        const mx = max.get(`${classOf.get(m.studentId)}:${m.subjectId}`) ?? 100;
        if (!byStudent.has(m.studentId)) byStudent.set(m.studentId, new Map());
        byStudent.get(m.studentId)!.set(m.subjectId, { mark: { score: m.score === null ? null : Number(m.score), status: m.status }, max: mx });
      }
      return { weight: Number(c.weight), byStudent };
    }),
  );
  const studentIds = new Set(parts.flatMap((p) => [...p.byStudent.keys()]));
  for (const sid of studentIds) {
    const subjectIds = new Set(parts.flatMap((p) => [...(p.byStudent.get(sid)?.keys() ?? [])]));
    const map = new Map<string, MarkInput>();
    for (const sub of subjectIds) {
      const combined = compositePercentage(parts.map((p) => {
        const e = p.byStudent.get(sid)?.get(sub);
        return { weight: p.weight, mark: e?.mark, maxMarks: e?.max ?? 100 };
      }));
      if (combined) map.set(sub, combined);
    }
    out.set(sid, map);
  }
  return { marks: out, maxOverride: new Map([["*", 100]]) };
}

export async function generateResults(examId: string, opts: { includeUnapproved?: boolean } = {}) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: true, classes: { include: { schoolClass: true } }, subjects: { include: { subject: true } } } });
  if (!exam.classes.length) throw new UserError("Add classes to the exam first.");
  if (!exam.subjects.length) throw new UserError("Configure the exam subjects first.");
  // Without DOS approval (the default), every saved mark counts.
  const includeUnapproved = !!opts.includeUnapproved || !(await marksApprovalRequired());
  const { marks, maxOverride } = await effectiveMarks(examId, includeUnapproved);
  const yearId = exam.term.academicYearId;
  const summary: { classId: string; students: number; ranked: number }[] = [];

  const resultRows: any[] = [];
  const subjectRows: any[] = [];
  for (const ec of exam.classes) {
    const level = ec.schoolClass.level;
    const [scales, rule] = await Promise.all([loadScales(level), loadRule(level)]);
    if (!scales.length) throw new UserError(`No default grading scale is set for ${level === "O_LEVEL" ? "O-Level" : "A-Level"}.`);
    const subs = exam.subjects.filter((s) => s.classId === ec.classId);
    // Class and stream come from the enrollment for the EXAM's academic year (not the student's
    // current class), so results for past exams stay correct after promotions and stream transfers.
    // Students who have since left are included only if marks were recorded for them.
    const enrollments = await prisma.enrollment.findMany({
      where: { academicYearId: yearId, classId: ec.classId, OR: [{ student: { status: "ACTIVE" } }, { student: { marks: { some: { examId } } } }] },
      select: { classId: true, streamId: true, student: { select: { id: true, subjects: { where: { academicYearId: yearId }, select: { subjectId: true } } } } },
    });
    const outcomes = computeResults({
      students: enrollments.map((e) => ({ id: e.student.id, classId: e.classId, streamId: e.streamId, subjectIds: e.student.subjects.map((x) => x.subjectId) })),
      subjects: subs.map((s) => ({
        subjectId: s.subjectId, maxMarks: maxOverride.get("*") ?? Number(s.maxMarks), category: s.subject.category as SubjectCategory, weight: Number(s.subject.weight),
      })),
      marks, scales, rule,
    });
    for (const o of outcomes) {
      resultRows.push({
        examId, studentId: o.studentId, classId: o.classId, streamId: o.streamId, subjectsCount: o.subjectsCount, total: o.total, average: o.average,
        points: o.points, aggregate: o.aggregate, division: o.division, classPosition: o.classPosition, classSize: o.classSize,
        streamPosition: o.streamPosition, streamSize: o.streamSize,
      });
      for (const s of o.subjects) {
        subjectRows.push({
          examId, studentId: o.studentId, subjectId: s.subjectId, score: s.score, percentage: s.percentage, status: s.state,
          grade: s.grade, points: s.points, remark: s.remark, subjectPosition: s.position, subjectSize: s.size,
        });
      }
    }
    summary.push({ classId: ec.classId, students: outcomes.length, ranked: outcomes.filter((o) => o.classPosition !== null).length });
  }
  await prisma.$transaction(async (tx) => {
    await tx.subjectResult.deleteMany({ where: { examId } });
    await tx.examResult.deleteMany({ where: { examId } });
    await tx.examResult.createMany({ data: resultRows });
    await tx.subjectResult.createMany({ data: subjectRows });
    await tx.exam.update({ where: { id: examId }, data: { resultsGeneratedAt: new Date() } });
  }, { timeout: 120_000 });
  return summary;
}

/** Ranked list for a class (and optional stream), plus subject results — used by results page, broadsheet and reports. */
export async function classResults(examId: string, classId: string, streamId?: string) {
  return prisma.examResult.findMany({
    where: { examId, classId, ...(streamId ? { streamId } : {}) },
    include: { student: { include: { stream: true } } },
    orderBy: [{ classPosition: { sort: "asc", nulls: "last" } }, { student: { lastName: "asc" } }],
  });
}
