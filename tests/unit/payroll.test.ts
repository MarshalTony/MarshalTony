import { describe, expect, it } from "vitest";
import { payeMonthly, nssfEmployee } from "@/lib/payroll";

describe("Uganda PAYE (monthly, resident)", () => {
  it("applies each band", () => {
    expect(payeMonthly(200_000)).toBe(0);
    expect(payeMonthly(235_000)).toBe(0);
    expect(payeMonthly(335_000)).toBe(10_000);
    expect(payeMonthly(410_000)).toBe(25_000);
    expect(payeMonthly(1_000_000)).toBe(25_000 + 590_000 * 0.3);
    expect(payeMonthly(12_000_000)).toBe(Math.round(25_000 + (12_000_000 - 410_000) * 0.3 + 2_000_000 * 0.1));
  });
  it("computes NSSF employee share at 5%", () => {
    expect(nssfEmployee(1_000_000)).toBe(50_000);
  });
});
