import { describe, expect, it } from "vitest";
import { balanceOf, withRunningBalance, adjustmentSide } from "@/lib/fees";

describe("fees ledger maths", () => {
  it("computes balance as debits minus credits without float error", () => {
    expect(balanceOf([{ debit: "850000.00", credit: 0 }, { debit: 0, credit: "300000.10" }, { debit: 0, credit: "0.20" }])).toBe(549999.7);
  });
  it("produces running balances", () => {
    const r = withRunningBalance([{ debit: 100, credit: 0 }, { debit: 0, credit: 40 }, { debit: 0, credit: 70 }]);
    expect(r.map((x) => x.balance)).toEqual([100, 60, -10]);
  });
  it("classifies adjustments", () => {
    expect(adjustmentSide("SCHOLARSHIP")).toBe("credit");
    expect(adjustmentSide("DISCOUNT")).toBe("credit");
    expect(adjustmentSide("OPENING_BALANCE")).toBe("debit");
    expect(adjustmentSide("DEBIT_ADJUSTMENT")).toBe("debit");
  });
});
