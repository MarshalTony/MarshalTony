import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { postAdjustment, postInvoice, postPayment, reversePayment, studentBalance } from "@/server/fees/ledger";
import { adminUser, currentYearAndTerm, student, testClass } from "./helpers";

describe("fees ledger (database)", async () => {
  const user = await adminUser();
  const { term } = await currentYearAndTerm();
  const cls = await testClass(1);
  const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: "CASH" } });
  const momo = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: "MTN_MOMO" } });

  it("computes balances through invoice, payments, reversal and scholarship", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    await prisma.$transaction((tx) => postInvoice(tx, { studentId: s.id, termId: term.id, userId: user.id, lines: [{ description: "Tuition", amount: 800000 }, { description: "Boarding", amount: 450000 }] }));
    expect(await studentBalance(prisma, s.id)).toBe(1250000);
    const p1 = await prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 500000, methodId: cash.id, paidAt: new Date(), userId: user.id }));
    await prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 250000, methodId: momo.id, externalRef: `REF-${s.id}`, paidAt: new Date(), userId: user.id }));
    expect(await studentBalance(prisma, s.id)).toBe(500000);
    await prisma.$transaction((tx) => reversePayment(tx, p1.id, "Cheque bounced", user.id));
    expect(await studentBalance(prisma, s.id)).toBe(1000000);
    await prisma.$transaction((tx) => postAdjustment(tx, { studentId: s.id, termId: term.id, type: "SCHOLARSHIP", amount: 300000, reason: "Sports", userId: user.id }));
    expect(await studentBalance(prisma, s.id)).toBe(700000);
    // the reversed payment is still on record
    expect(await prisma.payment.count({ where: { studentId: s.id } })).toBe(2);
  });

  it("refuses double reversal and duplicate external references", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    const p = await prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 1000, methodId: momo.id, externalRef: `DUP-${s.id}`, paidAt: new Date(), userId: user.id }));
    await expect(prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 1000, methodId: momo.id, externalRef: `DUP-${s.id}`, paidAt: new Date(), userId: user.id }))).rejects.toThrow(/already recorded/);
    await prisma.$transaction((tx) => reversePayment(tx, p.id, "wrong student", user.id));
    await expect(prisma.$transaction((tx) => reversePayment(tx, p.id, "again", user.id))).rejects.toThrow(/already been reversed/);
  });

  it("database triggers forbid editing or deleting completed transactions", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    const p = await prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 5000, methodId: cash.id, paidAt: new Date(), userId: user.id }));
    await expect(prisma.payment.update({ where: { id: p.id }, data: { amount: 1 } })).rejects.toThrow(/immutable/);
    await expect(prisma.ledgerEntry.deleteMany({ where: { studentId: s.id } })).rejects.toThrow(/immutable/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/immutable/);
  });

  it("issues unique, gap-free receipt numbers under concurrent payments", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    const results = await Promise.all(Array.from({ length: 15 }, () =>
      prisma.$transaction((tx) => postPayment(tx, { studentId: s.id, termId: term.id, amount: 100, methodId: cash.id, paidAt: new Date(), userId: user.id }))));
    const nums = results.map((r) => Number(r.receiptNo.split("-").pop())).sort((a, b) => a - b);
    expect(new Set(results.map((r) => r.receiptNo)).size).toBe(15);
    expect(new Set(results.map((r) => r.transactionRef)).size).toBe(15);
    expect(nums[14] - nums[0]).toBe(14);
    expect(await studentBalance(prisma, s.id)).toBe(-1500);
  });
});
