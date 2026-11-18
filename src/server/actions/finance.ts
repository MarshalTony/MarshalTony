"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { nextDocNo } from "../counters";
import { poItemsField } from "../schemas";

const METHOD = z.enum(["CASH", "BANK", "MOBILE_MONEY", "CHEQUE"]);

export const saveSupplier = action(
  { permission: "finance.manage", revalidate: "/finance/suppliers", schema: z.object({ id: zs.optId(), name: zs.str(120), phone: zs.optStr(30), email: zs.email(), address: zs.optStr(200), tinNumber: zs.optStr(30), isActive: zs.bool() }) },
  async ({ id, ...data }, user) => {
    const s = id ? await prisma.supplier.update({ where: { id }, data }) : await prisma.supplier.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Supplier", s.id, { name: data.name });
    return { ok: true, message: "Supplier saved." };
  },
);

export const saveExpenseCategory = action(
  { permission: "finance.manage", revalidate: "/finance", schema: z.object({ id: zs.optId(), name: zs.str(80), isActive: zs.bool() }) },
  async ({ id, ...data }, user) => {
    const c = id ? await prisma.expenseCategory.update({ where: { id }, data }) : await prisma.expenseCategory.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "ExpenseCategory", c.id, data);
    return { ok: true, message: "Category saved." };
  },
);

/** Payment voucher request. */
export const requestExpense = action(
  {
    permission: "finance.manage",
    revalidate: "/finance/expenses",
    schema: z.object({ date: zs.date(), categoryId: zs.id(), supplierId: zs.optId(), payee: zs.str(120), description: zs.str(500), amount: zs.positiveMoney(), method: METHOD, reference: zs.optStr(60) }),
  },
  async (data, user) => {
    const e = await prisma.$transaction(async (tx) => {
      const voucherNo = await nextDocNo(tx, "PV");
      const e = await tx.expense.create({ data: { ...data, voucherNo, requestedById: user.id } });
      await audit(user.id, "REQUEST_EXPENSE", "Expense", e.id, { voucherNo, amount: data.amount }, tx);
      return e;
    });
    return { ok: true, message: `Payment voucher ${e.voucherNo} created and awaiting approval.` };
  },
);

export const decideExpense = action(
  { permission: "finance.approve", revalidate: "/finance/expenses", schema: z.object({ id: zs.id(), decision: z.enum(["APPROVED", "REJECTED"]), note: zs.optStr(300) }) },
  async ({ id, decision, note }, user) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id } });
    if (e.status !== "PENDING") throw new UserError("Only pending vouchers can be approved or rejected.");
    if (e.requestedById === user.id && !user.roles.includes("HEADTEACHER") && !user.roles.includes("ADMIN"))
      throw new UserError("You cannot approve a voucher you requested (segregation of duties).");
    await prisma.expense.update({ where: { id }, data: { status: decision, approvedById: user.id, approvedAt: new Date(), voidReason: decision === "REJECTED" ? note : null } });
    await audit(user.id, decision === "APPROVED" ? "APPROVE_EXPENSE" : "REJECT_EXPENSE", "Expense", id, { note });
    return { ok: true, message: `Voucher ${e.voucherNo} ${decision.toLowerCase()}.` };
  },
);

export const markExpensePaid = action(
  { permission: "finance.manage", revalidate: "/finance/expenses", schema: z.object({ id: zs.id(), reference: zs.optStr(60) }) },
  async ({ id, reference }, user) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id } });
    if (e.status !== "APPROVED") throw new UserError("Only approved vouchers can be paid.");
    await prisma.expense.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), reference: reference ?? e.reference } });
    await audit(user.id, "PAY_EXPENSE", "Expense", id, { reference });
    return { ok: true, message: `Voucher ${e.voucherNo} marked as paid.` };
  },
);

export const voidExpense = action(
  { permission: "finance.approve", revalidate: "/finance/expenses", schema: z.object({ id: zs.id(), reason: zs.str(300) }) },
  async ({ id, reason }, user) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id } });
    if (e.status === "VOIDED") throw new UserError("Already voided.");
    await prisma.expense.update({ where: { id }, data: { status: "VOIDED", voidReason: reason } });
    await audit(user.id, "VOID_EXPENSE", "Expense", id, { reason, previousStatus: e.status });
    return { ok: true, message: `Voucher ${e.voucherNo} voided. It stays on record.` };
  },
);

export const recordIncome = action(
  { permission: "finance.manage", revalidate: "/finance/income", schema: z.object({ date: zs.date(), source: zs.str(80), description: zs.optStr(300), amount: zs.positiveMoney(), method: METHOD }) },
  async (data, user) => {
    const r = await prisma.$transaction(async (tx) => {
      const referenceNo = await nextDocNo(tx, "INC");
      const r = await tx.incomeRecord.create({ data: { ...data, referenceNo, recordedById: user.id } });
      await audit(user.id, "RECORD_INCOME", "IncomeRecord", r.id, { amount: data.amount, source: data.source }, tx);
      return r;
    });
    return { ok: true, message: `Income ${r.referenceNo} recorded.` };
  },
);

export const createPurchaseOrder = action(
  { permission: "finance.manage", revalidate: "/finance/purchase-orders", schema: z.object({ supplierId: zs.id(), date: zs.date(), notes: zs.optStr(300), items: poItemsField }) },
  async ({ items, ...data }, user) => {
    const total = Math.round(items.reduce((a, i) => a + i.quantity * i.unitPrice, 0) * 100) / 100;
    const po = await prisma.$transaction(async (tx) => {
      const poNumber = await nextDocNo(tx, "PO");
      const po = await tx.purchaseOrder.create({ data: { ...data, poNumber, total, createdById: user.id, items: { create: items } } });
      await audit(user.id, "CREATE_PO", "PurchaseOrder", po.id, { poNumber, total }, tx);
      return po;
    });
    return { ok: true, message: `Purchase order ${po.poNumber} created.` };
  },
);

export const setPurchaseOrderStatus = action(
  { permission: "finance.manage", revalidate: "/finance/purchase-orders", schema: z.object({ id: zs.id(), status: z.enum(["APPROVED", "RECEIVED", "CANCELLED"]) }) },
  async ({ id, status }, user) => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    const allowed: Record<string, string[]> = { DRAFT: ["APPROVED", "CANCELLED"], APPROVED: ["RECEIVED", "CANCELLED"], RECEIVED: [], CANCELLED: [] };
    if (!allowed[po.status].includes(status)) throw new UserError(`A ${po.status.toLowerCase()} order cannot become ${status.toLowerCase()}.`);
    if (status === "APPROVED" && !user.permissions.has("finance.approve")) throw new UserError("You need approval rights to approve purchase orders.");
    await prisma.purchaseOrder.update({ where: { id }, data: { status } });
    await audit(user.id, `PO_${status}`, "PurchaseOrder", id);
    return { ok: true, message: `Purchase order ${po.poNumber} ${status.toLowerCase()}.` };
  },
);

export const pettyCashEntry = action(
  { permission: "finance.manage", revalidate: "/finance/petty-cash", schema: z.object({ date: zs.date(), type: z.enum(["IN", "OUT"]), amount: zs.positiveMoney(), description: zs.str(300) }) },
  async (data, user) => {
    if (data.type === "OUT") {
      const agg = await prisma.pettyCashEntry.groupBy({ by: ["type"], _sum: { amount: true } });
      const bal = agg.reduce((a, r) => a + (r.type === "IN" ? 1 : -1) * Number(r._sum.amount ?? 0), 0);
      if (data.amount > bal) throw new UserError(`Insufficient petty cash (balance ${bal.toLocaleString("en-UG")}). Top up first.`);
    }
    const e = await prisma.pettyCashEntry.create({ data: { ...data, recordedById: user.id } });
    await audit(user.id, "PETTY_CASH", "PettyCashEntry", e.id, data);
    return { ok: true, message: "Petty cash entry recorded." };
  },
);

export const saveBudget = action(
  { permission: "finance.manage", revalidate: "/finance/budgets", schema: z.object({ academicYearId: zs.id(), categoryId: zs.id(), amount: zs.money() }) },
  async ({ academicYearId, categoryId, amount }, user) => {
    await prisma.budget.upsert({ where: { academicYearId_categoryId: { academicYearId, categoryId } }, update: { amount }, create: { academicYearId, categoryId, amount } });
    await audit(user.id, "SET_BUDGET", "Budget", `${academicYearId}:${categoryId}`, { amount });
    return { ok: true, message: "Budget saved." };
  },
);
