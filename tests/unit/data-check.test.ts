import { describe, expect, it } from "vitest";
import { isUgandanPhone, likelyDuplicates } from "@/lib/data-check";

describe("data clean-up helpers", () => {
  it("recognises Ugandan phone numbers", () => {
    for (const ok of ["0772123456", "+256 772 314 931", "256701234567", "0414-123456", "(0)772123456".replace("(0)", "0")]) expect(isUgandanPhone(ok)).toBe(true);
    for (const bad of ["", "12345", "0772 12345", "+254712345678", "077212345678", "0612345678"]) expect(isUgandanPhone(bad)).toBe(false);
  });
  it("finds the same names with the same birth date, or the same class when a birth date is missing", () => {
    const d = new Date("2011-03-14");
    const s = (id: string, f: string, l: string, dob: Date | null, c: string) => ({ id, firstName: f, lastName: l, dateOfBirth: dob, classId: c });
    const groups = likelyDuplicates([
      s("1", "Peter", "Okello", d, "S1"), s("2", "okello", "PETER", d, "S2"), // swapped names, same DOB
      s("3", "Grace", "Akello", null, "S3"), s("4", "Grace", "Akello", null, "S3"), // same class
      s("5", "Moses", "Achieng", null, "S1"), s("6", "Moses", "Achieng", null, "S4"), // different class, no DOB → not flagged
      s("7", "Joseph", "Opio", new Date("2012-01-10"), "S2"), s("8", "Joseph", "Opio", new Date("2012-11-14"), "S2"), // different known DOBs → different learners
    ]);
    expect(groups.map((g) => g.map((x) => x.id).sort())).toEqual([["1", "2"], ["3", "4"]]);
  });
});
