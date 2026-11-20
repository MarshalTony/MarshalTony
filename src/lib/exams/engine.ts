/**
 * Examination results engine — pure functions, no database access.
 *
 * Everything the school may want to change is passed in as configuration:
 * grading scales (bands, points, remarks), the ranking basis, tie method,
 * treatment of absent candidates, best-N aggregates and division bands.
 */

export type MarkState = "PRESENT" | "ABSENT" | "EXEMPTED" | "MISSING";
export type SubjectCategory = "COMPULSORY" | "ELECTIVE" | "PRINCIPAL" | "SUBSIDIARY";

export interface Band {
  grade: string;
  minScore: number;
  maxScore: number;
  points: number;
  remark: string;
}

export interface Scale {
  /** ALL | PRINCIPAL | SUBSIDIARY */
  appliesTo: string;
  bands: Band[];
}

export interface Rule {
  rankingBasis: "AVERAGE" | "TOTAL" | "POINTS" | "AGGREGATE";
  bestOfSubjects: number | null;
  tieMethod: "COMPETITION" | "DENSE";
  absentPolicy: "ZERO" | "EXCLUDE";
  minSubjectsToRank: number;
  divisions: { label: string; min: number; max: number }[];
}

export interface ExamSubjectInput {
  subjectId: string;
  maxMarks: number;
  category: SubjectCategory;
  weight: number;
}

export interface StudentInput {
  id: string;
  classId: string;
  streamId: string;
  /** Subjects this student takes in this exam (handles different combinations). */
  subjectIds: string[];
}

export interface MarkInput {
  score: number | null;
  status: "PRESENT" | "ABSENT" | "EXEMPTED";
  /** Grade decided outside the percentage scale (A-Level: from the paper grades, UACE rules). */
  override?: { grade: string; points: number; remark: string };
}

/**
 * Combines a subject's paper marks (index 0 = paper 1) into one mark: the mean over the papers sat or due
 * (a paper with no mark or ABS counts 0 once any paper has a mark; EX papers are left out).
 * All ABS/EX → that status; no marks at all → undefined.
 */
export function combinePapers(papers: (MarkInput | undefined)[]): MarkInput | undefined {
  if (papers.length <= 1) return papers[0];
  const due = papers.filter((p) => p?.status !== "EXEMPTED");
  const present = due.filter((p) => p?.status === "PRESENT" && p.score !== null && p.score !== undefined);
  if (present.length) return { score: round2(present.reduce((a, p) => a + p!.score!, 0) / due.length), status: "PRESENT" };
  const any = papers.find((p) => p);
  if (!any) return undefined;
  return { score: null, status: papers.some((p) => p?.status === "ABSENT") ? "ABSENT" : any.status };
}

export interface SubjectOutcome {
  subjectId: string;
  state: MarkState;
  score: number | null;
  percentage: number | null;
  grade: string | null;
  points: number | null;
  remark: string | null;
  counted: boolean;
  position: number | null;
  size: number;
}

export interface StudentOutcome {
  studentId: string;
  classId: string;
  streamId: string;
  subjects: SubjectOutcome[];
  subjectsCount: number;
  total: number;
  average: number;
  points: number;
  aggregate: number | null;
  division: string | null;
  rankValue: number | null;
  classPosition: number | null;
  classSize: number;
  streamPosition: number | null;
  streamSize: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Picks the band with the highest minScore not above the percentage. Robust to gaps like 79–80. */
export function gradeFor(percentage: number, bands: Band[]): Band | null {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  for (const b of sorted) if (percentage >= b.minScore) return b;
  return sorted.length ? sorted[sorted.length - 1] : null;
}

export function scaleFor(category: SubjectCategory, scales: Scale[]): Scale | null {
  const want = category === "SUBSIDIARY" ? "SUBSIDIARY" : category === "PRINCIPAL" ? "PRINCIPAL" : "ALL";
  return scales.find((s) => s.appliesTo === want) ?? scales.find((s) => s.appliesTo === "ALL") ?? scales[0] ?? null;
}

export function validateScore(score: number | null, max: number): string | null {
  if (score === null) return null;
  if (!Number.isFinite(score)) return "Mark is not a number";
  if (score < 0) return "Mark cannot be negative";
  if (score > max) return `Mark exceeds maximum (${max})`;
  return null;
}

/**
 * Assigns positions. Higher value ranks first unless `ascending` (aggregates).
 * Values are compared at 2 decimal places so floating-point noise never splits a tie.
 */
export function rank<T>(
  items: T[],
  value: (t: T) => number | null,
  opts: { ascending?: boolean; method?: "COMPETITION" | "DENSE" } = {},
): Map<T, number | null> {
  const out = new Map<T, number | null>();
  const ranked = items.filter((i) => value(i) !== null);
  for (const i of items) if (value(i) === null) out.set(i, null);
  const dir = opts.ascending ? 1 : -1;
  ranked.sort((a, b) => dir * (round2(value(a)!) - round2(value(b)!)));
  let prev: number | null = null;
  let pos = 0;
  let dense = 0;
  ranked.forEach((item, idx) => {
    const v = round2(value(item)!);
    if (prev === null || v !== prev) {
      pos = idx + 1;
      dense += 1;
      prev = v;
    }
    out.set(item, opts.method === "DENSE" ? dense : pos);
  });
  return out;
}

export function divisionFor(value: number | null, divisions: Rule["divisions"]): string | null {
  if (value === null || !divisions?.length) return null;
  const d = divisions.find((x) => value >= x.min && value <= x.max);
  return d ? d.label : null;
}

export function computeResults(args: {
  students: StudentInput[];
  subjects: ExamSubjectInput[];
  marks: Map<string, Map<string, MarkInput>>; // studentId -> subjectId -> mark
  scales: Scale[];
  rule: Rule;
}): StudentOutcome[] {
  const { students, subjects, marks, scales, rule } = args;
  const subjectById = new Map(subjects.map((s) => [s.subjectId, s]));

  const outcomes: StudentOutcome[] = students.map((st) => {
    const subs: SubjectOutcome[] = [];
    for (const sid of st.subjectIds) {
      const cfg = subjectById.get(sid);
      if (!cfg) continue; // subject not examined for this class
      const m = marks.get(st.id)?.get(sid);
      let state: MarkState = m ? m.status : "MISSING";
      if (state === "PRESENT" && (m?.score === null || m?.score === undefined)) state = "MISSING";
      let percentage: number | null = null;
      let score: number | null = null;
      let counted = false;
      if (state === "PRESENT") {
        score = m!.score!;
        percentage = round2((score / cfg.maxMarks) * 100);
        counted = true;
      } else if (state === "ABSENT" && rule.absentPolicy === "ZERO") {
        score = 0;
        percentage = 0;
        counted = true;
      }
      let grade: string | null = null;
      let points: number | null = null;
      let remark: string | null = null;
      if (counted && percentage !== null && m?.override) {
        grade = m.override.grade;
        points = m.override.points;
        remark = m.override.remark;
      } else if (counted && percentage !== null) {
        const scale = scaleFor(cfg.category, scales);
        const band = scale ? gradeFor(percentage, scale.bands) : null;
        if (band) {
          grade = band.grade;
          points = band.points;
          remark = band.remark;
        }
      } else if (state === "ABSENT") {
        grade = "ABS";
        remark = "Absent";
      } else if (state === "EXEMPTED") {
        grade = "EX";
        remark = "Exempted";
      } else {
        grade = null;
        remark = "Mark not entered";
      }
      subs.push({ subjectId: sid, state, score, percentage, grade, points, remark, counted, position: null, size: 0 });
    }

    const counted = subs.filter((s) => s.counted);
    const total = round2(counted.reduce((a, s) => a + (s.score ?? 0), 0));
    const wsum = counted.reduce((a, s) => a + (subjectById.get(s.subjectId)!.weight || 1), 0);
    const average = wsum ? round2(counted.reduce((a, s) => a + (s.percentage ?? 0) * (subjectById.get(s.subjectId)!.weight || 1), 0) / wsum) : 0;
    const points = round2(counted.reduce((a, s) => a + (s.points ?? 0) * (subjectById.get(s.subjectId)!.weight || 1), 0));

    let aggregate: number | null = null;
    if (rule.rankingBasis === "AGGREGATE") {
      const n = rule.bestOfSubjects ?? counted.length;
      if (counted.length >= n && n > 0) {
        const best = counted.map((s) => s.points ?? 0).sort((a, b) => a - b).slice(0, n);
        aggregate = best.reduce((a, b) => a + b, 0);
      }
    }

    const rankable = counted.length >= Math.max(1, rule.minSubjectsToRank);
    let rankValue: number | null = null;
    if (rankable) {
      if (rule.rankingBasis === "AVERAGE") rankValue = average;
      else if (rule.rankingBasis === "TOTAL") rankValue = total;
      else if (rule.rankingBasis === "POINTS") rankValue = points;
      else rankValue = aggregate;
    }
    const divisionBasis = rule.rankingBasis === "AGGREGATE" ? aggregate : rule.rankingBasis === "POINTS" ? points : average;

    return {
      studentId: st.id,
      classId: st.classId,
      streamId: st.streamId,
      subjects: subs,
      subjectsCount: counted.length,
      total,
      average,
      points,
      aggregate,
      division: rankable ? divisionFor(divisionBasis, rule.divisions) : null,
      rankValue,
      classPosition: null,
      classSize: 0,
      streamPosition: null,
      streamSize: 0,
    };
  });

  const ascending = rule.rankingBasis === "AGGREGATE";
  const method = rule.tieMethod;

  // Class positions
  const byClass = groupBy(outcomes, (o) => o.classId);
  for (const group of byClass.values()) {
    const pos = rank(group, (o) => o.rankValue, { ascending, method });
    for (const o of group) {
      o.classPosition = pos.get(o) ?? null;
      o.classSize = group.length;
    }
    // Subject positions within the class
    const subjectIds = new Set(group.flatMap((o) => o.subjects.map((s) => s.subjectId)));
    for (const sid of subjectIds) {
      const entries = group.flatMap((o) => o.subjects.filter((s) => s.subjectId === sid));
      const sp = rank(entries, (s) => (s.counted ? s.percentage : null), { method });
      const size = entries.filter((s) => s.counted).length;
      for (const e of entries) {
        e.position = sp.get(e) ?? null;
        e.size = size;
      }
    }
  }

  // Stream positions
  const byStream = groupBy(outcomes, (o) => o.streamId);
  for (const group of byStream.values()) {
    const pos = rank(group, (o) => o.rankValue, { ascending, method });
    for (const o of group) {
      o.streamPosition = pos.get(o) ?? null;
      o.streamSize = group.length;
    }
  }
  return outcomes;
}

export function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const i of items) {
    const k = key(i);
    const arr = m.get(k);
    if (arr) arr.push(i);
    else m.set(k, [i]);
  }
  return m;
}

/** Top-N by position (ties at the cut-off are all included). */
export function topN<T extends { position: number | null }>(items: T[], n: number): T[] {
  const sorted = items.filter((i) => i.position !== null).sort((a, b) => a.position! - b.position!);
  if (sorted.length <= n) return sorted;
  const cutoff = sorted[n - 1].position!;
  return sorted.filter((i) => i.position! <= cutoff);
}

/**
 * Examination formula for composite exams (e.g. End-of-term = 20% BOT + 20% MOT + 60% EOT).
 * Each component contributes a percentage. Components the student did not sit
 * are skipped and the remaining weights re-normalised; if none were sat the
 * status of the latest component (ABSENT/EXEMPTED) is carried.
 */
export function compositePercentage(
  parts: { weight: number; mark: MarkInput | undefined; maxMarks: number }[],
): MarkInput | undefined {
  let wsum = 0;
  let acc = 0;
  let lastStatus: MarkInput["status"] | null = null;
  for (const p of parts) {
    if (!p.mark) continue;
    lastStatus = p.mark.status;
    if (p.mark.status === "PRESENT" && p.mark.score !== null) {
      acc += (p.mark.score / p.maxMarks) * 100 * p.weight;
      wsum += p.weight;
    }
  }
  if (wsum > 0) return { score: round2(acc / wsum), status: "PRESENT" };
  if (lastStatus) return { score: null, status: lastStatus };
  return undefined;
}

export interface SubjectAnalysis {
  subjectId: string;
  candidates: number;
  average: number;
  highest: number;
  lowest: number;
  gradeCounts: Record<string, number>;
}

export function analyseSubjects(outcomes: StudentOutcome[]): SubjectAnalysis[] {
  const map = new Map<string, SubjectOutcome[]>();
  for (const o of outcomes) for (const s of o.subjects) if (s.counted) {
    const arr = map.get(s.subjectId) ?? [];
    arr.push(s);
    map.set(s.subjectId, arr);
  }
  return [...map.entries()].map(([subjectId, arr]) => {
    const p = arr.map((s) => s.percentage ?? 0);
    const gradeCounts: Record<string, number> = {};
    for (const s of arr) if (s.grade) gradeCounts[s.grade] = (gradeCounts[s.grade] ?? 0) + 1;
    return {
      subjectId,
      candidates: arr.length,
      average: round2(p.reduce((a, b) => a + b, 0) / arr.length),
      highest: Math.max(...p),
      lowest: Math.min(...p),
      gradeCounts,
    };
  });
}
