import { describe, expect, it } from "vitest";
import { applyDraft, changedCells, parseDraft } from "@/lib/drafts";

describe("marks drafts", () => {
  it("keeps only changed cells with the server value they replaced", () => {
    expect(changedCells({ a: "50", b: "", c: "ABS" }, { a: "50", b: "", c: "" })).toEqual({ c: { v: "ABS", base: "" } });
    expect(changedCells({ a: " 50", b: "50.0", c: "a", d: "x" }, { a: "50", b: "50", c: "ABS", d: "EX" })).toEqual({});
  });
  it("restores unsaved cells but never over a mark someone else saved since", () => {
    const draft = { savedAt: 1, cells: { a: { v: "60", base: "" }, b: { v: "70", base: "" }, gone: { v: "1", base: "" } } };
    const r = applyDraft({ a: "", b: "45" }, draft);
    expect(r.values).toEqual({ a: "60", b: "45" });
    expect(r.restored).toBe(1);
    expect(r.skipped).toBe(1);
  });
  it("ignores broken storage", () => {
    expect(parseDraft("{oops")).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('{"savedAt":5,"cells":{}}')).toEqual({ savedAt: 5, cells: {} });
  });
});
