import { describe, expect, it } from "vitest";
import { missingScores, papersLabel } from "@/lib/missing-scores";

describe("learners missing scores", () => {
  const learners = [
    { id: "a", name: "Achieng", admissionNo: "1", streamId: "s1", classId: "c1" },
    { id: "b", name: "Okello", admissionNo: "2", streamId: "s1", classId: "c1" },
    { id: "z", name: "Nakato", admissionNo: "3", streamId: "s5", classId: "c5" },
  ];
  const res = missingScores({
    learners,
    takes: [{ studentId: "a", subjectId: "eng" }, { studentId: "b", subjectId: "eng" }, { studentId: "b", subjectId: "lug" }, { studentId: "z", subjectId: "bio" }],
    examSubjects: new Set(["c1:eng", "c5:bio"]), // Luganda is not in the exam
    paperCount: new Map([["bio", 2]]),
    marks: [{ studentId: "a", subjectId: "eng", paper: 1 }, { studentId: "z", subjectId: "bio", paper: 1 }],
    chapters: [{ id: "ch1", title: "Drama", classId: "c1", subjectId: "eng" }, { id: "ch2", title: "Poetry", classId: "c1", subjectId: "eng" }],
    scored: new Set(["ch1:a", "ch2:a", "ch1:b"]),
  });
  it("lists only what is missing, per learner and subject", () => {
    expect(res).toEqual([
      { studentId: "b", subjectId: "eng", streamId: "s1", papers: [1], chapters: ["Poetry"] },
      { studentId: "z", subjectId: "bio", streamId: "s5", papers: [2], chapters: [] },
    ]);
  });
  it("labels the missing papers", () => {
    expect(papersLabel([1], 1)).toBe("Exam mark");
    expect(papersLabel([2], 2)).toBe("Paper 2");
    expect(papersLabel([1, 2], 2)).toBe("Papers 1, 2");
    expect(papersLabel([], 2)).toBe("");
  });
});
