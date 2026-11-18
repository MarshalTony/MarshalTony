import { describe, expect, it } from "vitest";
import { activityAverage, bandFor, DEFAULT_ACTIVITY_BANDS, eotOutOf80, outOf20, summaryRow, validActivityScore } from "@/lib/cbc";
import { gradeFor } from "@/lib/exams/engine";

// Values taken from the school's sample report (S.1 A, Term 3 2026)
describe("competency-based report calculations", () => {
  it("converts activity averages to marks out of 20 like the sample", () => {
    expect(outOf20(2.7)).toBe(18);
    expect(outOf20(3)).toBe(20);
    expect(outOf20(2.4)).toBe(16);
    expect(outOf20(2.9)).toBe(19);
    expect(outOf20(null)).toBe(0);
  });
  it("maps scores to identifiers 3/2/1", () => {
    expect(bandFor(2.7, DEFAULT_ACTIVITY_BANDS)!.grade).toBe("3");
    expect(bandFor(2.5, DEFAULT_ACTIVITY_BANDS)!.remark).toBe("Outstanding");
    expect(bandFor(2.49, DEFAULT_ACTIVITY_BANDS)!.grade).toBe("2");
    expect(bandFor(2.4, DEFAULT_ACTIVITY_BANDS)!.remark).toBe("Moderate");
    expect(bandFor(1.2, DEFAULT_ACTIVITY_BANDS)!.remark).toBe("Basic");
    expect(bandFor(0, DEFAULT_ACTIVITY_BANDS)).toBeNull();
    expect(bandFor(null, DEFAULT_ACTIVITY_BANDS)).toBeNull();
  });
  it("averages chapter scores, ignoring missing ones", () => {
    expect(activityAverage([2.7])).toBe(2.7);
    expect(activityAverage([3, 2.4, null])).toBe(2.7);
    expect(activityAverage([null, undefined])).toBeNull();
  });
  it("builds summary rows exactly like the sample report", () => {
    // Literature: 2.7 → 18 + 61 = 79 → C
    expect(summaryRow({ hasActivities: true, activityAvg: 2.7, eotScore: 61, eotMax: 80 })).toEqual({ out20: 18, eot80: 61, total: 79 });
    // Art & Design: chapter but no score → 0 + 65
    expect(summaryRow({ hasActivities: true, activityAvg: null, eotScore: 65, eotMax: 80 })).toEqual({ out20: 0, eot80: 65, total: 65 });
    // Physics: no chapters → blank + 56
    expect(summaryRow({ hasActivities: false, activityAvg: null, eotScore: 56, eotMax: 80 })).toEqual({ out20: null, eot80: 56, total: 56 });
    // EOT set out of 100 is converted to 80
    expect(eotOutOf80(75, 100)).toBe(60);
    expect(summaryRow({ hasActivities: false, activityAvg: null, eotScore: null, eotMax: 80 }).total).toBeNull();
  });
  it("grades totals on the school's scale (A 90–100, B 80–89, C 60–79, D 50–59, E 0–49)", () => {
    const bands = [
      { grade: "A", minScore: 90, maxScore: 100, points: 5, remark: "" }, { grade: "B", minScore: 80, maxScore: 89.99, points: 4, remark: "" },
      { grade: "C", minScore: 60, maxScore: 79.99, points: 3, remark: "" }, { grade: "D", minScore: 50, maxScore: 59.99, points: 2, remark: "" },
      { grade: "E", minScore: 0, maxScore: 49.99, points: 1, remark: "" },
    ];
    expect([79, 65, 86, 38, 85, 92, 56, 44].map((t) => gradeFor(t, bands)!.grade)).toEqual(["C", "C", "B", "E", "B", "A", "D", "E"]);
  });
  it("validates activity scores out of 3", () => {
    expect(validActivityScore("2.75")).toBe(2.8);
    expect(validActivityScore("")).toBeNull();
    expect(validActivityScore("3.5")).toBe("invalid");
    expect(validActivityScore("-1")).toBe("invalid");
    expect(validActivityScore("abc")).toBe("invalid");
  });
});
