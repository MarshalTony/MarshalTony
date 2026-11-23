import { describe, expect, it } from "vitest";
import { positions, subjectStats } from "@/lib/scoresheet";

describe("score sheet", () => {
  it("summarises a subject", () => {
    const s = subjectStats([{ score: 80, grade: "B" }, { score: 55, grade: "D" }, { score: null, grade: null }, { score: 92, grade: "A" }, { score: 80, grade: "B" }], ["A", "B", "C", "D", "E"]);
    expect(s).toEqual({ candidates: 4, mean: 76.8, highest: 92, lowest: 55, grades: { A: 1, B: 2, C: 0, D: 1, E: 0 } });
    expect(subjectStats([], ["A"])).toEqual({ candidates: 0, mean: null, highest: null, lowest: null, grades: { A: 0 } });
  });
  it("ranks with ties sharing a position", () => {
    const p = positions(new Map<string, number | null>([["a", 70], ["b", 85], ["c", 70], ["d", null], ["e", 60]]));
    expect(Object.fromEntries(p)).toEqual({ a: 2, b: 1, c: 2, d: null, e: 4 });
  });
});
