import "server-only";
import { marksApprovalRequired } from "./approval-setting";
import type { Level } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  combinePapers, computeResults, compositePercentage, type MarkInput, type Rule, type Scale, type SubjectCategory,
} from "@/lib/exams/engine";
import { DEFAULT_PAPER_BANDS, gradeSubject, type PaperBand } from "@/lib/uace";
import { UserError } from "../action";
import { syncExamSubjects } from "./exam-subjects";

export async function loadScales(level: Level): Promise<Scale[]> {
  const scales = await prisma.gradingScale.findMany({ where: { level, isDefault: true, appliesTo: { notIn: ["ACTIVITY", "PAPER"] } }, include: { bands: true } });
  return scales.map((s) => ({
    appliesTo: s.appliesTo,
    bands: s.bands.map((b) => ({ grade: b.grade, minScore: Number(b.minScore), maxScore: Number(b.maxScore), points: Number(b.points), remark: b.remark })),
  }));
}

/** A-Level paper grade bands (D1–F9) from Settings → Grading, or the defaults. */
export async function loadPaperBands(): Promise<PaperBand[]> {
  const sc = await prisma.gradingScale.findFirst({ where: { level: "A_LEVEL", appliesTo: "PAPER", isDefault: true }, include: { bands: true } });
  return sc?.bands.length
    ? sc.bands.map((b) => ({ grade: b.grade, minScore: Number(b.minScore), maxScore: Number(b.maxScore), points: Number(b.points), remark: b.remark }))
    : DEFAULT_PAPER_BANDS;
}

const toInput = (m: { score: unknown; status: MarkInput["status"] }): MarkInput => ({ score: m.score === null ? null : Number(m.score), status: m.status });

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

  // Subjects sat as several papers: marks are stored per paper and combined here (mean of the papers).
  const paperCount = new Map((await prisma.subject.findMany({ select: { id: true, paperCount: true } })).map((x) => [x.id, x.paperCount]));
  /** studentId → subjectId → { combined mark, the paper marks, class } */
  function collapse(rows: Awaited<ReturnType<typeof rawMarks>>) {
    const by = new Map<string, Map<string, { papers: (MarkInput | undefined)[]; classId: string }>>();
    for (const m of rows) {
      const n = paperCount.get(m.subjectId) ?? 1;
      if (m.paper > n) continue; // paper no longer part of the subject
      if (!by.has(m.studentId)) by.set(m.studentId, new Map());
      const subj = by.get(m.studentId)!;
      if (!subj.has(m.subjectId)) subj.set(m.subjectId, { papers: Array.from({ length: n }, () => undefined), classId: m.classId });
      subj.get(m.subjectId)!.papers[m.paper - 1] = toInput(m);
    }
    return by;
  }

  if (!exam.isComposite) {
    const papers = new Map<string, Map<string, (MarkInput | undefined)[]>>();
    for (const [sid, subj] of collapse(await rawMarks(examId))) {
      const map = new Map<string, MarkInput>();
      const pm = new Map<string, (MarkInput | undefined)[]>();
      for (const [sub, e] of subj) {
        const c = combinePapers(e.papers);
        if (c) map.set(sub, c);
        pm.set(sub, e.papers);
      }
      out.set(sid, map);
      papers.set(sid, pm);
    }
    return { marks: out, maxOverride, papers };
  }

  if (!exam.components.length) throw new UserError("This combined exam has no component exams configured.");
  const parts = await Promise.all(
    exam.components.map(async (c) => {
      const max = new Map(c.componentExam.subjects.map((s) => [`${s.classId}:${s.subjectId}`, Number(s.maxMarks)]));
      const byStudent = new Map<string, Map<string, { mark: MarkInput; max: number }>>();
      for (const [sid, subj] of collapse(await rawMarks(c.componentExamId))) {
        for (const [sub, e] of subj) {
          const mark = combinePapers(e.papers);
          if (!mark) continue;
          if (!byStudent.has(sid)) byStudent.set(sid, new Map());
          byStudent.get(sid)!.set(sub, { mark, max: max.get(`${e.classId}:${sub}`) ?? 100 });
        }
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
  return { marks: out, maxOverride: new Map([["*", 100]]), papers: null };
}

export async function generateResults(examId: string, opts: { includeUnapproved?: boolean } = {}) {
  await syncExamSubjects(examId); // students/subjects registered after the exam was created
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: true, classes: { include: { schoolClass: true } }, subjects: { include: { subject: true } } } });
  if (!exam.classes.length) throw new UserError("Add classes to the exam first.");
  if (!exam.subjects.length) throw new UserError("Configure the exam subjects first.");
  // Without DOS approval (the default), every saved mark counts.
  const includeUnapproved = !!opts.includeUnapproved || !(await marksApprovalRequired());
  const { marks, maxOverride, papers } = await effectiveMarks(examId, includeUnapproved);
  const paperBands = await loadPaperBands();
  const yearId = exam.term.academicYearId;
  const summary: { classId: string; students: number; ranked: number }[] = [];

  const resultRows: any[] = [];
  const subjectRows: any[] = [];
  for (const ec of exam.classes) {
    const level = ec.schoolClass.level;
    const [scales, rule] = await Promise.all([loadScales(level), loadRule(level)]);
    if (!scales.length) throw new UserError(`No default grading scale is set for ${level === "O_LEVEL" ? "O-Level" : "A-Level"}.`);
    const subs = exam.subjects.filter((s) => s.classId === ec.classId);
    // A-Level: each subject's grade and points come from its paper grades (D1–F9 → A–F, UACE rules), as on the report card.
    if (level === "A_LEVEL" && papers) {
      for (const es of subs) {
        const max = Number(es.maxMarks) || 100;
        for (const [sid, pm] of papers) {
          const ps = pm.get(es.subjectId);
          const m = marks.get(sid)?.get(es.subjectId);
          if (!ps || !m || m.status !== "PRESENT") continue;
          const g = gradeSubject(es.subject.category, ps.filter((p) => p?.status !== "EXEMPTED").map((p) => (p?.status === "PRESENT" && p.score !== null ? (p.score / max) * 100 : 0)), paperBands);
          if (g) m.override = { grade: g.grade, points: g.points, remark: g.remark };
        }
      }
    }
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
