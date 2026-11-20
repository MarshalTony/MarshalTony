import { describe, expect, it } from "vitest";
import { aLevelProblems } from "@/lib/alevel";

const P = (code: string) => ({ code, name: code, category: "PRINCIPAL" });
const S = (code: string, name = code) => ({ code, name, category: "SUBSIDIARY" });

describe("A-Level subject rule", () => {
  it("accepts 3 principals + General Paper + one of Sub-Maths / Sub-ICT", () => {
    expect(aLevelProblems([P("BIO"), P("CHE"), P("AGR"), S("GP"), S("S-MTC")], { complete: true })).toEqual([]);
    expect(aLevelProblems([P("PHY"), P("CHE"), P("MTC"), S("GP"), S("S-ICT")], { complete: true })).toEqual([]);
  });
  it("rejects a fourth principal and both Sub-Maths and Sub-ICT", () => {
    expect(aLevelProblems([P("A"), P("B"), P("C"), P("D")])[0]).toMatch(/4 principal subjects — the maximum is 3/);
    expect(aLevelProblems([S("GP"), S("S-MTC", "Subsidiary Mathematics"), S("S-ICT", "Subsidiary ICT")]).join()).toMatch(/both Subsidiary Mathematics and Subsidiary ICT/);
  });
  it("allows an incomplete set unless a complete one is required", () => {
    expect(aLevelProblems([P("A"), S("GP")])).toEqual([]);
    expect(aLevelProblems([P("A"), S("GP")], { complete: true })).toEqual(["only 1 principal subject(s) — needs 3", "no Sub-Maths or Sub-ICT"]);
  });
});
