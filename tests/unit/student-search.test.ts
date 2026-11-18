import { describe, expect, it } from "vitest";
import { searchTokens, studentWhere } from "@/server/queries/students";

describe("student search", () => {
  it("splits the search box into words", () => {
    expect(searchTokens("  Achieng   Moses ")).toEqual(["Achieng", "Moses"]);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens("a b c d e f g h")).toHaveLength(6);
  });
  it("requires every word to match, and matches local phone numbers against +256 numbers", () => {
    const w = studentWhere({ q: "moses 0772984381" }) as any;
    const words = w.AND.filter((x: any) => x.OR);
    expect(words).toHaveLength(2);
    const phoneOr = JSON.stringify(words[1]);
    expect(phoneOr).toContain('"contains":"772984381"');
    expect(phoneOr).toContain("linNumber");
  });
  it("adds subject, missing-info and status filters", () => {
    const w = JSON.stringify(studentWhere({ subjectId: "s1", missing: "photo", status: "ALL" }));
    expect(w).toContain('"subjectId":"s1"');
    expect(w).toContain('"photoFileId":null');
    expect(w).not.toContain('"status"');
    expect(JSON.stringify(studentWhere({}))).toContain('"status":"ACTIVE"');
  });
});
