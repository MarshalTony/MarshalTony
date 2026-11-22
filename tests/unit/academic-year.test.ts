import { describe, expect, it } from "vitest";
import { nextYearName, suggestTerms, termProblems } from "@/lib/academic-year";

describe("academic years", () => {
  it("names the next year", () => {
    expect(nextYearName("2026")).toBe("2027");
    expect(nextYearName("2026/27")).toBe("2027/28");
    expect(nextYearName("Year A")).toBe("");
  });
  it("suggests next year's term dates from this year's", () => {
    const t = suggestTerms([{ number: 2, startDate: "2026-05-25", endDate: "2026-08-14" }, { number: 1, startDate: "2026-02-02", endDate: "2026-04-30" }], 2027);
    expect(t).toEqual([{ number: 1, startDate: "2027-02-02", endDate: "2027-04-30" }, { number: 2, startDate: "2027-05-25", endDate: "2027-08-14" }]);
    expect(suggestTerms([], 2027).map((x) => x.number)).toEqual([1, 2, 3]);
  });
  it("checks term dates", () => {
    const year = { startDate: "2027-01-01", endDate: "2027-12-31" };
    expect(termProblems(suggestTerms([], 2027), year)).toEqual([]);
    expect(termProblems([{ number: 1, startDate: "2027-02-02", endDate: "2027-05-30" }, { number: 2, startDate: "2027-05-25", endDate: "2027-05-20" }, { number: 3, startDate: "2028-01-05", endDate: "2028-02-01" }], year))
      .toEqual(["Term 2: closing date must be after opening date", "Term 2 must open after Term 1 closes", "Term 3: must be inside the year (2027-01-01 to 2027-12-31)"]);
  });
});
