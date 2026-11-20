import { describe, expect, it } from "vitest";
import { activityProgress, pctOf, progressOf } from "@/lib/exams/progress";

describe("report readiness rules", () => {
  it("classifies marks progress", () => {
    expect(progressOf(0, 0)).toBe("na");
    expect(progressOf(0, 40)).toBe("none");
    expect(progressOf(12, 40)).toBe("partial");
    expect(progressOf(40, 40)).toBe("complete");
    expect(pctOf(12, 40)).toBe(30);
    expect(pctOf(0, 0)).toBe(100);
  });
  it("needs a chapter and a score for every learner for activities", () => {
    expect(activityProgress(0, 40, 0)).toEqual({ done: 0, expected: 40, state: "none" });
    expect(activityProgress(2, 40, 60)).toEqual({ done: 60, expected: 80, state: "partial" });
    expect(activityProgress(2, 40, 80).state).toBe("complete");
    expect(activityProgress(2, 0, 0).state).toBe("na");
  });
});
