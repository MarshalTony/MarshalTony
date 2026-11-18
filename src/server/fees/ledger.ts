import "server-only";
import type { AdjustmentType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { adjustmentLedgerType, adjustmentSide } from "@/lib/fees";
import { nextDocNo } from "../counters";
import { UserError } from "../action";

export async function studentBalance(tx: Tx, studentId: string) {
  const agg = await tx.ledgerEntry.aggregate({ where: { studentId }, _sum: { debit: true, credit: true } });
  return Math.round((Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0)) * 100) / 100;
}

/** Discounts, scholarships, bursaries, waivers, opening balances and manual adjustments. */
export async function postAdjustment(
  tx: Tx,
  a: { studentId: string; termId: string | null; type: AdjustmentType; amount: number; reason: string; userId: string },
) {
  if (!(a.amount > 0)) throw new UserError("Amount must be greater than zero.");
  const referenceNo = await nextDocNo(tx, "ADJ");
  const adj = await tx.feeAdjustment.create({
    data: { referenceNo, studentId: a.studentId, termId: a.termId, type: a.type, amount: a.amount, reason: a.reason, approvedById: a.userId },
  });
  const side = adjustmentSide(a.type);
  await tx.ledgerEntry.create({
    data: {
      studentId: a.studentId, termId: a.termId, type: adjustmentLedgerType(a.type),
      debit: side === "debit" ? a.amount : 0, credit: side === "credit" ? a.amount : 0,
      reference: referenceNo, description: `${a.type.replaceAll("_", " ").toLowerCase()}: ${a.reason}`, sourceId: adj.id, createdById: a.userId,
    },
  });
  return adj;
}

export async function postInvoice(
  tx: Tx,
  inv: { studentId: string; termId: string; lines: { description: string; amount: number }[]; dueDate?: Date | null; userId: string },
) {
  const lines = inv.lines.filter((l) => l.amount > 0);
  if (!lines.length) throw new UserError("An invoice needs at least one charge.");
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const invoiceNo = await nextDocNo(tx, "INV");
  const invoice = await tx.invoice.create({
    data: { invoiceNo, studentId: inv.studentId, termId: inv.termId, total, dueDate: inv.dueDate ?? null, createdById: inv.userId, lines: { create: lines } },
  });
  await tx.ledgerEntry.create({
    data: { studentId: inv.studentId, termId: inv.termId, type: "INVOICE", debit: total, reference: invoiceNo, description: lines.map((l) => l.description).join(", ").slice(0, 300), sourceId: invoice.id, createdById: inv.userId },
  });
  return invoice;
}

export async function postPayment(
  tx: Tx,
  p: { studentId: string; termId: string; amount: number; methodId: string; paidAt: Date; externalRef?: string | null; payerName?: string | null; payerPhone?: string | null; notes?: string | null; userId: string },
) {
  if (!(p.amount > 0)) throw new UserError("Amount must be greater than zero.");
  const method = await tx.paymentMethod.findUnique({ where: { id: p.methodId } });
  if (!method?.isActive) throw new UserError("Choose an active payment method.");
  if (p.externalRef) {
    const dup = await tx.payment.findFirst({ where: { methodId: p.methodId, externalRef: p.externalRef } });
    if (dup) throw new UserError(`A ${method.name} payment with reference ${p.externalRef} was already recorded (receipt ${dup.receiptNo}).`);
  }
  const receiptNo = await nextDocNo(tx, "RCT");
  const transactionRef = await nextDocNo(tx, "TXN", new Date().getFullYear(), 8);
  const payment = await tx.payment.create({
    data: {
      receiptNo, transactionRef, studentId: p.studentId, termId: p.termId, amount: p.amount, methodId: p.methodId, paidAt: p.paidAt,
      externalRef: p.externalRef ?? null, payerName: p.payerName ?? null, payerPhone: p.payerPhone ?? null, notes: p.notes ?? null, recordedById: p.userId,
    },
  });
  await tx.ledgerEntry.create({
    data: { studentId: p.studentId, termId: p.termId, type: "PAYMENT", credit: p.amount, reference: receiptNo, description: `Payment (${method.name})${p.externalRef ? ` ref ${p.externalRef}` : ""}`, sourceId: payment.id, createdById: p.userId },
  });
  return payment;
}

export async function reversePayment(tx: Tx, paymentId: string, reason: string, userId: string) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { reversal: true } });
  if (!payment) throw new UserError("Payment not found.");
  if (payment.reversal) throw new UserError("This payment has already been reversed.");
  const rev = await tx.paymentReversal.create({ data: { paymentId, reason, reversedById: userId } });
  await tx.ledgerEntry.create({
    data: {
      studentId: payment.studentId, termId: payment.termId, type: "PAYMENT_REVERSAL", debit: payment.amount, reference: payment.receiptNo,
      description: `Reversal of receipt ${payment.receiptNo}: ${reason}`, sourceId: rev.id, createdById: userId,
    },
  });
  return rev;
}
