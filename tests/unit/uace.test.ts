import { describe, expect, it } from "vitest";
import { gradeSubject, initials, paperBand, paperLabel, subjectGradeFromPapers, termAverage } from "@/lib/uace";
import { combinePapers, computeResults } from "@/lib/exams/engine";

describe("A-Level paper grades (D1–F9)", () => {
  it("uses the school's bands", () => {
    expect([100, 80, 79, 70, 65, 60, 55, 50, 49, 40, 39, 30, 29, 0].map((p) => paperBand(p).grade))
      .toEqual(["D1", "D1", "D2", "D2", "C3", "C4", "C5", "C6", "P7", "P7", "P8", "P8", "F9", "F9"]);
  });
  it("labels principal and subsidiary papers", () => {
    expect(paperLabel("PRINCIPAL", 2)).toBe("P/2");
    expect(paperLabel("SUBSIDIARY", 1)).toBe("S/1");
  });
});

describe("subject grade from paper grades", () => {
  it("principal: worst paper decides", () => {
    const g = (n: number[]) => subjectGradeFromPapers("PRINCIPAL", n)!.grade;
    expect(g([1, 2])).toBe("A");
    expect(g([1, 3])).toBe("B");
    expect(g([4, 2])).toBe("C");
    expect(g([5, 5])).toBe("D");
    expect(g([6, 1])).toBe("E");
    expect(g([7, 8])).toBe("O");
    expect(g([9, 1])).toBe("F");
    expect(subjectGradeFromPapers("PRINCIPAL", [1, 1])!.points).toBe(6);
    expect(subjectGradeFromPapers("PRINCIPAL", [8, 7])!.points).toBe(1);
  });
  it("subsidiary: O (1 point) when every paper is C6 or better", () => {
    expect(subjectGradeFromPapers("SUBSIDIARY", [6])).toMatchObject({ grade: "O", points: 1 });
    expect(subjectGradeFromPapers("SUBSIDIARY", [7])).toMatchObject({ grade: "F", points: 0 });
  });
  it("matches the school's sample card (total points 0)", () => {
    const rows: [string, (number | null)[], string, string[]][] = [
      ["SUBSIDIARY", [termAverage([39, 34])], "F", ["P8"]], // General Paper 37
      ["SUBSIDIARY", [termAverage([5, 27])], "F", ["F9"]], // Sub-Maths 16
      ["PRINCIPAL", [termAverage([null, 50]), termAverage([30, 23])], "F", ["F9", "F9"]], // Biology 25, 27
      ["PRINCIPAL", [termAverage([0, 20]), termAverage([46, 26])], "F", ["F9", "P8"]], // Agriculture 10, 36
      ["PRINCIPAL", [termAverage([17, 50]), termAverage([14, 28])], "F", ["P8", "F9"]], // Chemistry 34, 21
    ];
    let total = 0;
    for (const [cat, avgs, grade, papers] of rows) {
      const r = gradeSubject(cat, avgs)!;
      expect(r.grade).toBe(grade);
      expect(r.papers.map((p) => p.band!.grade)).toEqual(papers);
      total += r.points;
    }
    expect(total).toBe(0);
  });
  it("a missing paper counts 0 once another paper has a mark; none at all = no grade", () => {
    expect(gradeSubject("PRINCIPAL", [85, null])!.grade).toBe("F");
    expect(gradeSubject("PRINCIPAL", [null, null])).toBeNull();
  });
});

describe("term average across BOT / EOT", () => {
  it("counts a missing exam as 0 and rounds half up", () => {
    expect(termAverage([null, 50])).toBe(25);
    expect(termAverage([39, 34])).toBe(37);
    expect(termAverage([30, 23])).toBe(27);
    expect(termAverage([null, null])).toBeNull();
  });
  it("teacher initials", () => expect(initials("Okello", "Peter")).toBe("OP"));
});

describe("combining paper marks", () => {
  it("mean of the papers; a missing or absent paper counts 0", () => {
    expect(combinePapers([{ score: 60, status: "PRESENT" }, { score: 40, status: "PRESENT" }])).toEqual({ score: 50, status: "PRESENT" });
    expect(combinePapers([{ score: 60, status: "PRESENT" }, undefined])).toEqual({ score: 30, status: "PRESENT" });
    expect(combinePapers([{ score: 60, status: "PRESENT" }, { score: null, status: "ABSENT" }])).toEqual({ score: 30, status: "PRESENT" });
    expect(combinePapers([{ score: 60, status: "PRESENT" }, { score: null, status: "EXEMPTED" }])).toEqual({ score: 60, status: "PRESENT" });
    expect(combinePapers([{ score: null, status: "ABSENT" }, undefined])).toEqual({ score: null, status: "ABSENT" });
    expect(combinePapers([undefined, undefined])).toBeUndefined();
    expect(combinePapers([{ score: 70, status: "PRESENT" }])).toEqual({ score: 70, status: "PRESENT" });
  });
  it("the engine uses a grade override (A-Level) instead of the percentage scale", () => {
    const [o] = computeResults({
      students: [{ id: "s", classId: "c", streamId: "x", subjectIds: ["bio"] }],
      subjects: [{ subjectId: "bio", maxMarks: 100, category: "PRINCIPAL", weight: 1 }],
      marks: new Map([["s", new Map([["bio", { score: 85, status: "PRESENT" as const, override: { grade: "F", points: 0, remark: "Fail" } }]])]]),
      scales: [{ appliesTo: "PRINCIPAL", bands: [{ grade: "A", minScore: 0, maxScore: 100, points: 6, remark: "x" }] }],
      rule: { rankingBasis: "POINTS", bestOfSubjects: null, tieMethod: "COMPETITION", absentPolicy: "EXCLUDE", minSubjectsToRank: 1, divisions: [] },
    });
    expect(o.subjects[0]).toMatchObject({ grade: "F", points: 0, percentage: 85 });
    expect(o.points).toBe(0);
  });
});
