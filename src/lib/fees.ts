import type { AdjustmentType, LedgerType } from "@prisma/client";

/** Adjustment types that increase what the student owes. */
export const DEBIT_ADJUSTMENTS: AdjustmentType[] = ["DEBIT_ADJUSTMENT", "OPENING_BALANCE"];

export function adjustmentSide(type: AdjustmentType): "debit" | "credit" {
  return DEBIT_ADJUSTMENTS.includes(type) ? "debit" : "credit";
}

export function adjustmentLedgerType(type: AdjustmentType): LedgerType {
  return type as LedgerType;
}

/** Balance = debits − credits. Positive means the student owes the school. */
export function balanceOf(entries: { debit: unknown; credit: unknown }[]) {
  let cents = 0;
  for (const e of entries) cents += Math.round(Number(e.debit) * 100) - Math.round(Number(e.credit) * 100);
  return cents / 100;
}

/** Running balance for statements. */
export function withRunningBalance<T extends { debit: unknown; credit: unknown }>(entries: T[]) {
  let cents = 0;
  return entries.map((e) => {
    cents += Math.round(Number(e.debit) * 100) - Math.round(Number(e.credit) * 100);
    return { ...e, balance: cents / 100 };
  });
}
