"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { postAdjustment, postInvoice, postPayment, reversePayment, studentBalance } from "../fees/ledger";
import { sendMessage, renderTemplate } from "../messaging";
import { feeLinesField } from "../schemas";
import { ugx } from "@/lib/utils";

export const saveFeeStructure = action(
  {
    permission: "fees.manage",
    revalidate: "/fees/structures",
    schema: z.object({ termId: zs.id(), classIds: zs.ids(), residence: z.enum(["DAY", "BOARDING"]), lines: feeLinesField }),
  },
  async ({ termId, classIds, residence, lines }, user) => {
    if (!classIds.length) throw new UserError("Choose at least one class.");
    await prisma.$transaction(async (tx) => {
      for (const classId of classIds) {
        const existing = await tx.feeStructure.findUnique({ where: { termId_classId_residence: { termId, classId, residence } } });
        if (existing) {
          await tx.feeStructureItem.deleteMany({ where: { structureId: existing.id } });
          await tx.feeStructureItem.createMany({ data: lines.map((l) => ({ ...l, structureId: existing.id })) });
        } else {
          await tx.feeStructure.create({ data: { termId, classId, residence, items: { create: lines } } });
        }
      }
      await audit(user.id, "SAVE_FEE_STRUCTURE", "FeeStructure", termId, { classIds, residence, lines }, tx);
    });
    return { ok: true, message: `Fee structure saved for ${classIds.length} class(es). Already-issued invoices are not changed.` };
  },
);

export const copyFeeStructures = action(
  { permission: "fees.manage", revalidate: "/fees/structures", schema: z.object({ fromTermId: zs.id(), toTermId: zs.id() }) },
  async ({ fromTermId, toTermId }, user) => {
    if (fromTermId === toTermId) throw new UserError("Choose two different terms.");
    const src = await prisma.feeStructure.findMany({ where: { termId: fromTermId }, include: { items: true } });
    if (!src.length) throw new UserError("The source term has no fee structures.");
    let n = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of src) {
        const exists = await tx.feeStructure.findUnique({ where: { termId_classId_residence: { termId: toTermId, classId: s.classId, residence: s.residence } } });
        if (exists) continue;
        await tx.feeStructure.create({ data: { termId: toTermId, classId: s.classId, residence: s.residence, items: { create: s.items.map(({ name, amount, isOptional }) => ({ name, amount, isOptional })) } } });
        n++;
      }
      await audit(user.id, "COPY_FEE_STRUCTURES", "FeeStructure", toTermId, { fromTermId, copied: n }, tx);
    });
    return { ok: true, message: `${n} structure(s) copied (existing ones were left unchanged).` };
  },
);

/** Issues term invoices from fee structures to every active student without one for that term. */
export const billTerm = action(
  { permission: "fees.manage", revalidate: "/fees", schema: z.object({ termId: zs.id(), classId: zs.optId(), dueDate: zs.optDate() }) },
  async ({ termId, classId, dueDate }, user) => {
    const structures = await prisma.feeStructure.findMany({ where: { termId, ...(classId ? { classId } : {}) }, include: { items: { where: { isOptional: false } } } });
    if (!structures.length) throw new UserError("No fee structure exists for this term/class.");
    const students = await prisma.student.findMany({ where: { status: "ACTIVE", ...(classId ? { classId } : {}), invoices: { none: { termId } } }, select: { id: true, classId: true, residence: true } });
    let issued = 0;
    let missing = 0;
    for (const s of students) {
      const st = structures.find((x) => x.classId === s.classId && x.residence === s.residence);
      if (!st || !st.items.length) { missing++; continue; }
      await prisma.$transaction((tx) => postInvoice(tx, { studentId: s.id, termId, dueDate, userId: user.id, lines: st.items.map((i) => ({ description: i.name, amount: Number(i.amount) })) }));
      issued++;
    }
    await audit(user.id, "BILL_TERM", "Term", termId, { classId, issued, missingStructure: missing });
    return { ok: true, message: `${issued} invoice(s) issued.${missing ? ` ${missing} student(s) skipped: no matching fee structure.` : ""}${students.length === 0 ? " Every student is already invoiced for this term." : ""}` };
  },
);

export const invoiceStudent = action(
  { permission: "fees.manage", schema: z.object({ studentId: zs.id(), termId: zs.id(), lines: feeLinesField, dueDate: zs.optDate() }) },
  async ({ studentId, termId, lines, dueDate }, user) => {
    const inv = await prisma.$transaction((tx) => postInvoice(tx, { studentId, termId, lines: lines.map((l) => ({ description: l.name, amount: l.amount })), dueDate, userId: user.id }));
    await audit(user.id, "INVOICE", "Invoice", inv.id, { studentId, total: Number(inv.total) });
    return { ok: true, message: `Invoice ${inv.invoiceNo} issued for ${ugx(inv.total)}.` };
  },
);

export const recordPayment = action(
  {
    permission: "fees.collect",
    schema: z.object({
      studentId: zs.id(), termId: zs.id(), amount: zs.positiveMoney(), methodId: zs.id(), paidAt: zs.date(), externalRef: zs.optStr(60),
      payerName: zs.optStr(120), payerPhone: zs.optStr(30), notes: zs.optStr(300),
    }),
  },
  async (input, user) => {
    // The form gives a date only: today's payments take the current time, back-dated ones midday (Kampala).
    const day = input.paidAt.toISOString().slice(0, 10);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
    if (day > today) throw new UserError("Payment date cannot be in the future.");
    input.paidAt = day === today ? new Date() : new Date(`${day}T12:00:00+03:00`);
    const method = await prisma.paymentMethod.findUnique({ where: { id: input.methodId } });
    if (method && method.code !== "CASH" && !input.externalRef) throw new UserError(`Enter the ${method.name} transaction / slip reference.`);
    const { payment, balance } = await prisma.$transaction(async (tx) => {
      const payment = await postPayment(tx, { ...input, userId: user.id });
      await audit(user.id, "PAYMENT", "Payment", payment.id, { receiptNo: payment.receiptNo, amount: input.amount, studentId: input.studentId }, tx);
      return { payment, balance: await studentBalance(tx, input.studentId) };
    });
    // Optional SMS to the primary guardian (setting in Settings → School profile)
    const prefs = ((await prisma.schoolSetting.findUnique({ where: { id: 1 } }))?.notificationPrefs ?? {}) as Record<string, boolean>;
    if (prefs.smsOnPayment) {
      const [st, tpl] = await Promise.all([
        prisma.student.findUnique({ where: { id: input.studentId }, include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } }),
        prisma.messageTemplate.findUnique({ where: { code: "PAYMENT_RECEIVED" } }),
      ]);
      const g = st?.guardians[0]?.guardian;
      if (g && tpl) await sendMessage({ channel: "SMS", to: g.phone, toName: g.fullName, category: "FEES", userId: user.id,
        body: renderTemplate(tpl.body, { guardian: g.fullName, student: `${st!.firstName} ${st!.lastName}`, amount: ugx(input.amount), receiptNo: payment.receiptNo, balance: ugx(balance) }) });
    }
    return { ok: true, message: `Payment recorded. Receipt ${payment.receiptNo}. New balance ${ugx(balance)}.`, redirect: `/fees/students/${input.studentId}?receipt=${payment.id}` };
  },
);

export const reversePaymentAction = action(
  { permission: "fees.reverse", schema: z.object({ paymentId: zs.id(), reason: zs.str(300) }) },
  async ({ paymentId, reason }, user) => {
    await prisma.$transaction(async (tx) => {
      await reversePayment(tx, paymentId, reason, user.id);
      await audit(user.id, "REVERSE_PAYMENT", "Payment", paymentId, { reason }, tx);
    });
    return { ok: true, message: "Payment reversed. The original record and the reversal are both kept." };
  },
);

export const postAdjustmentAction = action(
  {
    permission: "fees.reverse",
    schema: z.object({
      studentId: zs.id(), termId: zs.optId(), amount: zs.positiveMoney(), reason: zs.str(300),
      type: z.enum(["DISCOUNT", "SCHOLARSHIP", "BURSARY", "WAIVER", "DEBIT_ADJUSTMENT", "CREDIT_ADJUSTMENT", "OPENING_BALANCE"]),
    }),
  },
  async (input, user) => {
    const adj = await prisma.$transaction(async (tx) => {
      const adj = await postAdjustment(tx, { ...input, userId: user.id });
      await audit(user.id, "FEE_ADJUSTMENT", "FeeAdjustment", adj.id, { ...input }, tx);
      return adj;
    });
    return { ok: true, message: `${input.type.replaceAll("_", " ").toLowerCase()} ${adj.referenceNo} posted.` };
  },
);

export const sendFeeReminders = action(
  { permission: "communication.send", schema: z.object({ classId: zs.optId(), minBalance: zs.money() }) },
  async ({ classId, minBalance }, user) => {
    const tpl = await prisma.messageTemplate.findUnique({ where: { code: "FEES_REMINDER" } });
    if (!tpl) throw new UserError("Template FEES_REMINDER is missing (Settings → Lists & templates).");
    const rows = await prisma.$queryRaw<{ id: string; balance: number }[]>`
      SELECT s.id, COALESCE(SUM(l.debit) - SUM(l.credit), 0)::float AS balance
      FROM "Student" s JOIN "LedgerEntry" l ON l."studentId" = s.id
      WHERE s.status = 'ACTIVE' AND (${classId}::text IS NULL OR s."classId" = ${classId})
      GROUP BY s.id HAVING COALESCE(SUM(l.debit) - SUM(l.credit), 0) >= ${Math.max(minBalance, 1)}`;
    const students = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
    const counts: Record<string, number> = {};
    for (const s of students) {
      const g = s.guardians[0]?.guardian;
      if (!g) { counts.NO_GUARDIAN = (counts.NO_GUARDIAN ?? 0) + 1; continue; }
      const bal = rows.find((r) => r.id === s.id)!.balance;
      const m = await sendMessage({ channel: tpl.channel as any, to: tpl.channel === "EMAIL" ? g.email ?? "" : g.phone, toName: g.fullName, category: "FEES", userId: user.id, subject: tpl.subject ?? undefined,
        body: renderTemplate(tpl.body, { guardian: g.fullName, student: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, balance: ugx(bal) }) });
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    await audit(user.id, "FEE_REMINDERS", "Student", null, { classId, minBalance, ...counts });
    return { ok: true, message: `${students.length} reminder(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(", ") || "none"}.` };
  },
);
