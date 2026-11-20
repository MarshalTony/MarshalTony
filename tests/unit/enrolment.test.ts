import { describe, expect, it } from "vitest";
import { ageBand, ageOn, crossBySex } from "@/lib/enrolment";

describe("enrolment statistics helpers", () => {
  const jan1 = new Date(Date.UTC(2026, 0, 1));
  it("computes age on 1 January", () => {
    expect(ageOn(new Date(Date.UTC(2012, 0, 1)), jan1)).toBe(14);
    expect(ageOn(new Date(Date.UTC(2012, 0, 2)), jan1)).toBe(13);
    expect(ageBand(new Date(Date.UTC(2016, 5, 1)), jan1)).toBe("Under 12");
    expect(ageBand(new Date(Date.UTC(2004, 5, 1)), jan1)).toBe("20+");
    expect(ageBand(null, jan1)).toBe("Unknown");
  });
  it("cross-tabulates by sex", () => {
    const t = crossBySex([{ c: "S1", a: "13", s: "MALE" }, { c: "S1", a: "13", s: "FEMALE" }, { c: "S1", a: "14", s: "MALE" }] as const, (x) => x.a, (x) => x.c, (x) => x.s);
    expect(t.get("13")!.get("S1")).toEqual({ M: 1, F: 1 });
    expect(t.get("14")!.get("S1")).toEqual({ M: 1, F: 0 });
  });
});
