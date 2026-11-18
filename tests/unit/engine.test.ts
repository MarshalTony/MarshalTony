import { describe, expect, it } from "vitest";
import {
  computeResults, gradeFor, rank, topN, compositePercentage, validateScore, analyseSubjects,
  type Band, type Rule, type Scale, type MarkInput,
} from "@/lib/exams/engine";

const oBands: Band[] = [
  { grade: "D1", minScore: 80, maxScore: 100, points: 1, remark: "Distinction" },
  { grade: "D2", minScore: 75, maxScore: 79, points: 2, remark: "Distinction" },
  { grade: "C3", minScore: 70, maxScore: 74, points: 3, remark: "Credit" },
  { grade: "C4", minScore: 65, maxScore: 69, points: 4, remark: "Credit" },
  { grade: "C5", minScore: 60, maxScore: 64, points: 5, remark: "Credit" },
  { grade: "C6", minScore: 55, maxScore: 59, points: 6, remark: "Credit" },
  { grade: "P7", minScore: 50, maxScore: 54, points: 7, remark: "Pass" },
  { grade: "P8", minScore: 45, maxScore: 49, points: 8, remark: "Pass" },
  { grade: "F9", minScore: 0, maxScore: 44, points: 9, remark: "Fail" },
];
const oScales: Scale[] = [{ appliesTo: "ALL", bands: oBands }];
const avgRule: Rule = { rankingBasis: "AVERAGE", bestOfSubjects: null, tieMethod: "COMPETITION", absentPolicy: "EXCLUDE", minSubjectsToRank: 1, divisions: [] };

function marks(rows: Record<string, Record<string, MarkInput>>) {
  const m = new Map<string, Map<string, MarkInput>>();
  for (const [s, subs] of Object.entries(rows)) m.set(s, new Map(Object.entries(subs)));
  return m;
}
const P = (score: number): MarkInput => ({ score, status: "PRESENT" });

describe("grading", () => {
  it("grades by band minimum and handles boundary gaps (79.5 → D2)", () => {
    expect(gradeFor(80, oBands)!.grade).toBe("D1");
    expect(gradeFor(79.5, oBands)!.grade).toBe("D2");
    expect(gradeFor(44.99, oBands)!.grade).toBe("F9");
    expect(gradeFor(100, oBands)!.grade).toBe("D1");
    expect(gradeFor(0, oBands)!.grade).toBe("F9");
  });
  it("validates invalid marks", () => {
    expect(validateScore(101, 100)).toMatch(/exceeds/);
    expect(validateScore(-1, 100)).toMatch(/negative/);
    expect(validateScore(Number.NaN, 100)).toMatch(/number/);
    expect(validateScore(50, 100)).toBeNull();
    expect(validateScore(null, 100)).toBeNull();
  });
});

describe("ranking", () => {
  it("uses competition ranking for ties (1,1,3)", () => {
    const items = [{ v: 90 }, { v: 80 }, { v: 90 }, { v: 70 }];
    const r = rank(items, (i) => i.v);
    expect(items.map((i) => r.get(i))).toEqual([1, 3, 1, 4]);
  });
  it("supports dense ranking (1,1,2)", () => {
    const items = [{ v: 90 }, { v: 80 }, { v: 90 }];
    const r = rank(items, (i) => i.v, { method: "DENSE" });
    expect(items.map((i) => r.get(i))).toEqual([1, 2, 1]);
  });
  it("treats floating noise as a tie", () => {
    const items = [{ v: 0.1 + 0.2 }, { v: 0.3 }];
    const r = rank(items, (i) => i.v);
    expect(r.get(items[0])).toBe(1);
    expect(r.get(items[1])).toBe(1);
  });
  it("ranks aggregates ascending and leaves unrankable out", () => {
    const items = [{ v: 12 }, { v: 8 }, { v: null as number | null }];
    const r = rank(items, (i) => i.v, { ascending: true });
    expect(items.map((i) => r.get(i))).toEqual([2, 1, null]);
  });
  it("topN includes ties at the cut-off", () => {
    const xs = [1, 2, 3, 3, 5].map((position) => ({ position }));
    expect(topN(xs, 3)).toHaveLength(4);
    expect(topN(xs, 12)).toHaveLength(5);
  });
});

describe("computeResults", () => {
  const subjects = [
    { subjectId: "ENG", maxMarks: 100, category: "COMPULSORY" as const, weight: 1 },
    { subjectId: "MTC", maxMarks: 100, category: "COMPULSORY" as const, weight: 1 },
    { subjectId: "BIO", maxMarks: 50, category: "COMPULSORY" as const, weight: 1 },
  ];
  const all = ["ENG", "MTC", "BIO"];
  const students = [
    { id: "a", classId: "S1", streamId: "S1A", subjectIds: all },
    { id: "b", classId: "S1", streamId: "S1A", subjectIds: all },
    { id: "c", classId: "S1", streamId: "S1B", subjectIds: all },
    { id: "d", classId: "S1", streamId: "S1B", subjectIds: all },
  ];

  it("computes totals, percentages, averages, positions and stream positions", () => {
    const res = computeResults({
      students, subjects, scales: oScales, rule: avgRule,
      marks: marks({
        a: { ENG: P(90), MTC: P(80), BIO: P(40) }, // 90,80,80 → 83.33
        b: { ENG: P(60), MTC: P(70), BIO: P(25) }, // 60,70,50 → 60
        c: { ENG: P(90), MTC: P(80), BIO: P(40) }, // tie with a
        d: { ENG: P(50), MTC: P(50), BIO: P(25) }, // 50
      }),
    });
    const by = Object.fromEntries(res.map((r) => [r.studentId, r]));
    expect(by.a.total).toBe(210);
    expect(by.a.average).toBe(83.33);
    expect(by.a.subjects.find((s) => s.subjectId === "BIO")!.percentage).toBe(80);
    expect(by.a.classPosition).toBe(1);
    expect(by.c.classPosition).toBe(1);
    expect(by.b.classPosition).toBe(3);
    expect(by.d.classPosition).toBe(4);
    expect(by.a.streamPosition).toBe(1);
    expect(by.b.streamPosition).toBe(2);
    expect(by.c.streamPosition).toBe(1);
    expect(by.a.classSize).toBe(4);
    expect(by.a.streamSize).toBe(2);
    // subject position for MTC: a,c 80 → 1 ; b 70 → 3 ; d 50 → 4
    expect(by.b.subjects.find((s) => s.subjectId === "MTC")!.position).toBe(3);
    expect(by.a.subjects.find((s) => s.subjectId === "ENG")!.grade).toBe("D1");
  });

  it("excludes absent, exempted and missing marks under EXCLUDE policy", () => {
    const res = computeResults({
      students: students.slice(0, 1), subjects, scales: oScales, rule: avgRule,
      marks: marks({ a: { ENG: P(80), MTC: { score: null, status: "ABSENT" }, BIO: { score: null, status: "EXEMPTED" } } }),
    });
    expect(res[0].subjectsCount).toBe(1);
    expect(res[0].average).toBe(80);
    const mtc = res[0].subjects.find((s) => s.subjectId === "MTC")!;
    expect(mtc.grade).toBe("ABS");
    expect(mtc.position).toBeNull();
  });

  it("counts absent as zero under ZERO policy, still excludes exempted", () => {
    const res = computeResults({
      students: students.slice(0, 1), subjects, scales: oScales, rule: { ...avgRule, absentPolicy: "ZERO" },
      marks: marks({ a: { ENG: P(80), MTC: { score: null, status: "ABSENT" }, BIO: { score: null, status: "EXEMPTED" } } }),
    });
    expect(res[0].subjectsCount).toBe(2);
    expect(res[0].average).toBe(40);
    expect(res[0].subjects.find((s) => s.subjectId === "MTC")!.grade).toBe("F9");
  });

  it("does not rank students below the minimum subject count", () => {
    const res = computeResults({
      students: students.slice(0, 2), subjects, scales: oScales, rule: { ...avgRule, minSubjectsToRank: 3 },
      marks: marks({ a: { ENG: P(99) }, b: { ENG: P(50), MTC: P(50), BIO: P(25) } }),
    });
    const by = Object.fromEntries(res.map((r) => [r.studentId, r]));
    expect(by.a.classPosition).toBeNull();
    expect(by.b.classPosition).toBe(1);
  });

  it("only uses subjects each student takes (different combinations)", () => {
    const res = computeResults({
      students: [
        { id: "x", classId: "S5", streamId: "S5A", subjectIds: ["ENG", "MTC"] },
        { id: "y", classId: "S5", streamId: "S5A", subjectIds: ["ENG", "BIO"] },
      ],
      subjects, scales: oScales, rule: avgRule,
      marks: marks({ x: { ENG: P(70), MTC: P(90), BIO: P(50) }, y: { ENG: P(70), BIO: P(45) } }),
    });
    const x = res.find((r) => r.studentId === "x")!;
    expect(x.subjects.map((s) => s.subjectId)).toEqual(["ENG", "MTC"]);
    expect(x.average).toBe(80);
    const y = res.find((r) => r.studentId === "y")!;
    expect(y.average).toBe(80);
    expect(x.classPosition).toBe(1);
    expect(y.classPosition).toBe(1);
  });

  it("computes best-N aggregate and divisions (lower is better)", () => {
    const rule: Rule = {
      ...avgRule, rankingBasis: "AGGREGATE", bestOfSubjects: 2,
      divisions: [{ label: "I", min: 2, max: 6 }, { label: "II", min: 7, max: 12 }, { label: "U", min: 13, max: 18 }],
    };
    const res = computeResults({
      students: students.slice(0, 2), subjects, scales: oScales, rule,
      marks: marks({ a: { ENG: P(85), MTC: P(76), BIO: P(10) }, b: { ENG: P(55), MTC: P(60), BIO: P(30) } }),
    });
    const by = Object.fromEntries(res.map((r) => [r.studentId, r]));
    expect(by.a.aggregate).toBe(3); // D1(1) + D2(2)
    expect(by.a.division).toBe("I");
    expect(by.b.aggregate).toBe(10); // BIO 30/50=60% C5(5) + MTC C5(5); ENG C6 dropped
    expect(by.b.division).toBe("II");
    expect(by.a.classPosition).toBe(1);
  });

  it("A-Level points with separate principal and subsidiary scales and weights", () => {
    const principal: Scale = { appliesTo: "PRINCIPAL", bands: [
      { grade: "A", minScore: 80, maxScore: 100, points: 6, remark: "" },
      { grade: "B", minScore: 70, maxScore: 79, points: 5, remark: "" },
      { grade: "F", minScore: 0, maxScore: 69, points: 0, remark: "" },
    ] };
    const subsidiary: Scale = { appliesTo: "SUBSIDIARY", bands: [
      { grade: "O", minScore: 50, maxScore: 100, points: 1, remark: "" },
      { grade: "F", minScore: 0, maxScore: 49, points: 0, remark: "" },
    ] };
    const res = computeResults({
      students: [{ id: "s", classId: "S6", streamId: "S6A", subjectIds: ["P1", "P2", "GP"] }],
      subjects: [
        { subjectId: "P1", maxMarks: 100, category: "PRINCIPAL", weight: 1 },
        { subjectId: "P2", maxMarks: 100, category: "PRINCIPAL", weight: 1 },
        { subjectId: "GP", maxMarks: 100, category: "SUBSIDIARY", weight: 1 },
      ],
      marks: marks({ s: { P1: P(85), P2: P(72), GP: P(60) } }),
      scales: [principal, subsidiary],
      rule: { ...avgRule, rankingBasis: "POINTS" },
    });
    expect(res[0].points).toBe(12);
    expect(res[0].subjects.map((s) => s.grade)).toEqual(["A", "B", "O"]);
  });

  it("produces subject analysis", () => {
    const res = computeResults({
      students: students.slice(0, 2), subjects, scales: oScales, rule: avgRule,
      marks: marks({ a: { ENG: P(80) }, b: { ENG: P(60) } }),
    });
    const eng = analyseSubjects(res).find((s) => s.subjectId === "ENG")!;
    expect(eng.average).toBe(70);
    expect(eng.highest).toBe(80);
    expect(eng.candidates).toBe(2);
  });
});

describe("composite exam formula", () => {
  it("weights component percentages and re-normalises missed components", () => {
    expect(compositePercentage([
      { weight: 20, mark: P(40), maxMarks: 50 }, // 80%
      { weight: 80, mark: P(60), maxMarks: 100 }, // 60%
    ])!.score).toBe(64);
    expect(compositePercentage([
      { weight: 20, mark: { score: null, status: "ABSENT" }, maxMarks: 50 },
      { weight: 80, mark: P(60), maxMarks: 100 },
    ])!.score).toBe(60);
    expect(compositePercentage([{ weight: 1, mark: { score: null, status: "ABSENT" }, maxMarks: 100 }])!.status).toBe("ABSENT");
    expect(compositePercentage([{ weight: 1, mark: undefined, maxMarks: 100 }])).toBeUndefined();
  });
});

import { parseDate } from "@/server/imports/excel";
describe("import date parsing", () => {
  it("accepts ISO and Ugandan day-first dates", () => {
    expect(parseDate("2011-05-12")!.toISOString().slice(0, 10)).toBe("2011-05-12");
    expect(parseDate("12/05/2011")!.toISOString().slice(0, 10)).toBe("2011-05-12");
  });
  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("31/31/2020")).toBeNull();
    expect(parseDate("30/02/2024")).toBeNull();
    expect(parseDate("2023-02-29")).toBeNull();
    expect(parseDate("29/02/2024")!.toISOString().slice(0, 10)).toBe("2024-02-29");
  });
});
