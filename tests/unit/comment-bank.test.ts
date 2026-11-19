import { describe, expect, it } from "vitest";
import { matching, pickComment, type BankEntry } from "@/lib/comment-bank";
import { meanTotal } from "@/server/exams/comment-basis";

const bank: BankEntry[] = [
  { role: "CLASS_TEACHER", minScore: 80, maxScore: 89.99, text: "Very good, {name}." },
  { role: "CLASS_TEACHER", minScore: 80, maxScore: 89.99, text: "Keep it up, {name}." },
  { role: "CLASS_TEACHER", minScore: 0, maxScore: 49.99, text: "{name} must work harder." },
  { role: "HEADTEACHER", minScore: 80, maxScore: 89.99, text: "Commendable." },
];

describe("comment bank", () => {
  it("matches by role and inclusive range", () => {
    expect(matching(bank, "CLASS_TEACHER", 80)).toHaveLength(2);
    expect(matching(bank, "CLASS_TEACHER", 89.99)).toHaveLength(2);
    expect(matching(bank, "CLASS_TEACHER", 90)).toHaveLength(0);
    expect(matching(bank, "HEADTEACHER", 85)).toHaveLength(1);
    expect(matching(bank, "CLASS_TEACHER", null)).toHaveLength(0);
  });
  it("rotates variants and fills the first name", () => {
    expect(pickComment(bank, "CLASS_TEACHER", 85, "Grace", 0)).toBe("Very good, Grace.");
    expect(pickComment(bank, "CLASS_TEACHER", 85, "Grace", 1)).toBe("Keep it up, Grace.");
    expect(pickComment(bank, "CLASS_TEACHER", 85, "Grace", 2)).toBe("Very good, Grace.");
    expect(pickComment(bank, "CLASS_TEACHER", 30, "Moses")).toBe("Moses must work harder.");
    expect(pickComment(bank, "DOS", 85, "Moses")).toBe("");
  });
});

describe("competency average for comments", () => {
  it("averages subject totals and ignores blank subjects", () => {
    expect(meanTotal([79, 92, null, 64])).toBe(78.3);
    expect(meanTotal([null, null])).toBeNull();
  });
});
