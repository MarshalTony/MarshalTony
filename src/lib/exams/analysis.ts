/** Pure calculations behind the results-analysis page and PDF (no database access). */

export type SubjectMark = { studentId: string; subjectId: string; streamId: string; gender: "MALE" | "FEMALE"; pct: number; grade: string | null };
export type StudentAvg = { studentId: string; name: string; streamId: string; gender: "MALE" | "FEMALE"; avg: number };

const r1 = (n: number) => Math.round(n * 10) / 10;
export const mean = (xs: number[]) => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Average per subject per stream, per subject overall, and the number who sat. */
export function subjectStreamMatrix(marks: SubjectMark[]) {
  const cell = new Map<string, number[]>();
  const overall = new Map<string, number[]>();
  for (const m of marks) {
    const k = `${m.subjectId}:${m.streamId}`;
    cell.set(k, [...(cell.get(k) ?? []), m.pct]);
    overall.set(m.subjectId, [...(overall.get(m.subjectId) ?? []), m.pct]);
  }
  return {
    cell: (subjectId: string, streamId: string) => mean(cell.get(`${subjectId}:${streamId}`) ?? []),
    count: (subjectId: string, streamId: string) => (cell.get(`${subjectId}:${streamId}`) ?? []).length,
    overall: (subjectId: string) => mean(overall.get(subjectId) ?? []),
    sat: (subjectId: string) => (overall.get(subjectId) ?? []).length,
  };
}

/** Boys' and girls' average per subject. */
export function genderBySubject(marks: SubjectMark[], subjectId: string) {
  const of = (g: "MALE" | "FEMALE") => mean(marks.filter((m) => m.subjectId === subjectId && m.gender === g).map((m) => m.pct));
  return { boys: of("MALE"), girls: of("FEMALE") };
}

/** Grade counts (A, B, …) across all subject marks. */
export function gradeDistribution(marks: SubjectMark[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of marks) if (m.grade) out[m.grade] = (out[m.grade] ?? 0) + 1;
  return out;
}

/**
 * Each teacher's average over the subject × stream cells they teach in this exam.
 * `teachers` maps "subjectId:streamId" → teacher names.
 */
export function teacherPerformance(marks: SubjectMark[], teachers: Map<string, string[]>) {
  const by = new Map<string, { pcts: number[]; classes: Set<string> }>();
  for (const m of marks) {
    const k = `${m.subjectId}:${m.streamId}`;
    for (const t of teachers.get(k) ?? []) {
      const e = by.get(t) ?? { pcts: [], classes: new Set<string>() };
      e.pcts.push(m.pct);
      e.classes.add(k);
      by.set(t, e);
    }
  }
  return [...by.entries()].map(([teacher, e]) => ({ teacher, avg: mean(e.pcts)!, marks: e.pcts.length, cells: [...e.classes] }))
    .sort((a, b) => b.avg - a.avg);
}

export type Change = StudentAvg & { previous: number; delta: number };

/** Change in each student's average since the comparison exam (only students who sat both). */
export function changes(current: StudentAvg[], previous: Map<string, number>): Change[] {
  return current.filter((s) => previous.has(s.studentId))
    .map((s) => ({ ...s, previous: previous.get(s.studentId)!, delta: r1(s.avg - previous.get(s.studentId)!) }))
    .sort((a, b) => b.delta - a.delta);
}

export type Risk = StudentAvg & { reasons: string[]; failed: number; delta: number | null };

/**
 * Students needing support: average below the pass mark, failing `failLimit` or more subjects,
 * or dropping by `dropLimit` points or more since the comparison exam.
 */
export function atRisk(students: StudentAvg[], marks: SubjectMark[], previous: Map<string, number> | null, opts: { passMark: number; failLimit: number; dropLimit: number }): Risk[] {
  const out: Risk[] = [];
  for (const s of students) {
    const failed = marks.filter((m) => m.studentId === s.studentId && m.pct < opts.passMark).length;
    const delta = previous?.has(s.studentId) ? r1(s.avg - previous.get(s.studentId)!) : null;
    const reasons: string[] = [];
    if (s.avg < opts.passMark) reasons.push(`average ${s.avg.toFixed(1)}% below ${opts.passMark}%`);
    if (failed >= opts.failLimit) reasons.push(`below ${opts.passMark}% in ${failed} subjects`);
    if (delta !== null && delta <= -opts.dropLimit) reasons.push(`dropped ${Math.abs(delta).toFixed(1)} points`);
    if (reasons.length) out.push({ ...s, reasons, failed, delta });
  }
  return out.sort((a, b) => a.avg - b.avg);
}
