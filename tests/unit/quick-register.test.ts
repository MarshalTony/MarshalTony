import { describe, expect, it } from "vitest";
import { normaliseQuickRow, parseDob, parsePasted, parseResidence, parseSex, quickRowProblems, type QuickRow } from "@/lib/quick-register";

const row = (p: Partial<QuickRow>): QuickRow => normaliseQuickRow({ lastName: "", firstName: "", otherNames: "", gender: "", residence: "", dateOfBirth: "", linNumber: "", houseId: "", combinationId: "", guardianName: "", guardianPhone: "", ...p });
const opts = { aLevel: false, houseIds: new Set(["h1"]), combinationIds: new Set<string>(), existing: [{ firstName: "Peter", lastName: "Okello", admissionNo: "BOHS/2026/0001" }], today: new Date("2026-11-22") };

describe("quick registration", () => {
  it("understands the usual ways of writing sex, day/boarding and dates", () => {
    expect(["m", "Male", "BOY", "f", "Female", "girl", "x"].map(parseSex)).toEqual(["MALE", "MALE", "MALE", "FEMALE", "FEMALE", "FEMALE", "x"]);
    expect(["", "d", "Day", "b", "Boarder", "boarding"].map(parseResidence)).toEqual(["DAY", "DAY", "DAY", "BOARDING", "BOARDING", "BOARDING"]);
    expect(["2011-03-14", "14/03/2011", "4-3-2011", "31/02/2011", "soon", ""].map(parseDob)).toEqual(["2011-03-14", "2011-03-14", "2011-03-04", "invalid", "invalid", ""]);
  });
  it("accepts a good row and tidies it", () => {
    const r = row({ lastName: "  Achieng ", firstName: "Mercy", gender: "f", dateOfBirth: "14/03/2011", linNumber: "u08f", houseId: "h1", guardianName: "Mr Achieng", guardianPhone: "0772 123 456" });
    expect(r).toMatchObject({ lastName: "Achieng", gender: "FEMALE", residence: "DAY", dateOfBirth: "2011-03-14", linNumber: "U08F", guardianPhone: "0772123456" });
    expect(quickRowProblems([r], opts)).toEqual([]);
  });
  it("lists every problem with the row number", () => {
    const p = quickRowProblems([
      row({ lastName: "Okello", firstName: "Peter", gender: "M" }),
      row({ lastName: "Mugisha", gender: "q", residence: "weekly", dateOfBirth: "2030-01-01", houseId: "zz", guardianPhone: "abc" }),
      row({ lastName: "Byaruhanga", firstName: "Ann", gender: "F" }),
      row({ lastName: "Ann", firstName: "Byaruhanga", gender: "F" }),
    ], opts);
    expect(p[0]).toBe("Row 1 (Okello Peter): already in this class (BOHS/2026/0001)");
    expect(p[1]).toMatch(/^Row 2 \(Mugisha\): first name missing, sex "q" not understood.*"weekly" is not Day or Boarding.*in the future.*unknown house.*not a phone number.*name missing/);
    expect(p[2]).toBe("Row 4 (Ann Byaruhanga): same name as row 3");
  });
  it("reads text pasted from Excel", () => {
    expect(parsePasted("Okello\tPeter\tM\r\nAchieng\tMercy\tF\r\n")).toEqual([["Okello", "Peter", "M"], ["Achieng", "Mercy", "F"]]);
    expect(parsePasted("Okello\nAchieng")).toEqual([["Okello"], ["Achieng"]]);
  });
});
