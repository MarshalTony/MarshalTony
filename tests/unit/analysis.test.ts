import { describe, expect, it } from "vitest";
import { atRisk, changes, genderBySubject, gradeDistribution, subjectStreamMatrix, teacherPerformance, type SubjectMark, type StudentAvg } from "@/lib/exams/analysis";

const M = (studentId: string, subjectId: string, streamId: string, gender: "MALE" | "FEMALE", pct: number, grade: string | null = null): SubjectMark => ({ studentId, subjectId, streamId, gender, pct, grade });
const marks = [
  M("s1", "ENG", "A", "MALE", 80, "B"), M("s2", "ENG", "A", "FEMALE", 60, "C"), M("s3", "ENG", "B", "FEMALE", 40, "E"),
  M("s1", "MTC", "A", "MALE", 90, "A"), M("s2", "MTC", "A", "FEMALE", 45, "E"), M("s3", "MTC", "B", "FEMALE", 30, "E"),
];
const students: StudentAvg[] = [
  { studentId: "s1", name: "One", streamId: "A", gender: "MALE", avg: 85 },
  { studentId: "s2", name: "Two", streamId: "A", gender: "FEMALE", avg: 52.5 },
  { studentId: "s3", name: "Three", streamId: "B", gender: "FEMALE", avg: 35 },
];

describe("results analysis", () => {
  it("averages subjects by stream and overall", () => {
    const m = subjectStreamMatrix(marks);
    expect(m.cell("ENG", "A")).toBe(70);
    expect(m.cell("ENG", "B")).toBe(40);
    expect(m.overall("ENG")).toBe(60);
    expect(m.sat("MTC")).toBe(3);
    expect(m.cell("PHY", "A")).toBeNull();
  });
  it("compares boys and girls and counts grades", () => {
    expect(genderBySubject(marks, "ENG")).toEqual({ boys: 80, girls: 50 });
    expect(gradeDistribution(marks)).toEqual({ B: 1, C: 1, E: 3, A: 1 });
  });
  it("averages each teacher over the classes they teach", () => {
    const t = teacherPerformance(marks, new Map([["ENG:A", ["Okello"]], ["ENG:B", ["Akello"]], ["MTC:A", ["Okello"]]]));
    expect(t[0]).toMatchObject({ teacher: "Okello", avg: 68.8, marks: 4 });
    expect(t[1]).toMatchObject({ teacher: "Akello", avg: 40, marks: 1 });
  });
  it("finds changes since the previous exam and students at risk", () => {
    const prev = new Map([["s1", 70], ["s2", 65]]);
    const ch = changes(students, prev);
    expect(ch.map((c) => [c.studentId, c.delta])).toEqual([["s1", 15], ["s2", -12.5]]);
    const risk = atRisk(students, marks, prev, { passMark: 50, failLimit: 2, dropLimit: 10 });
    expect(risk.map((r) => r.studentId)).toEqual(["s3", "s2"]);
    expect(risk[0].reasons).toEqual(["average 35.0% below 50%", "below 50% in 2 subjects"]);
    expect(risk[1].reasons).toEqual(["dropped 12.5 points"]);
  });
});
