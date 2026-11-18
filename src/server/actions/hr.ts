"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { can } from "../auth";
import { payeMonthly, nssfEmployee } from "@/lib/payroll";

export const requestLeave = action(
  {
    permission: null,
    revalidate: "/hr",
    schema: z.object({ staffId: zs.optId(), type: z.enum(["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY", "OTHER"]), startDate: zs.date(), endDate: zs.date(), reason: zs.optStr(500) }),
  },
  async ({ staffId, ...data }, user) => {
    // Staff apply for themselves; HR managers may file on someone's behalf.
    const target = staffId && can(user, "staff.manage") ? staffId : user.staffId;
    if (!target) throw new UserError("Your account is not linked to a staff record.");
    if (data.endDate < data.startDate) throw new UserError("End date is before start date.");
    const overlap = await prisma.leaveRequest.findFirst({ where: { staffId: target, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } } });
    if (overlap) throw new UserError("This overlaps another pending or approved leave request.");
    const l = await prisma.leaveRequest.create({ data: { ...data, staffId: target } });
    await audit(user.id, "REQUEST_LEAVE", "LeaveRequest", l.id, data);
    return { ok: true, message: "Leave request submitted." };
  },
);

export const decideLeave = action(
  { permission: "hr.leave.approve", revalidate: "/hr", schema: z.object({ id: zs.id(), decision: z.enum(["APPROVED", "REJECTED"]), note: zs.optStr(300) }) },
  async ({ id, decision, note }, user) => {
    const l = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
    if (l.status !== "PENDING") throw new UserError("Already decided.");
    if (l.staffId === user.staffId) throw new UserError("You cannot approve your own leave.");
    await prisma.leaveRequest.update({ where: { id }, data: { status: decision, decidedById: user.id, decidedAt: new Date(), decisionNote: note } });
    await audit(user.id, `LEAVE_${decision}`, "LeaveRequest", id, { note });
    return { ok: true, message: `Leave ${decision.toLowerCase()}.` };
  },
);

export const requestAdvance = action(
  { permission: "payroll.manage", revalidate: "/hr", schema: z.object({ staffId: zs.id(), amount: zs.positiveMoney(), date: zs.date(), reason: zs.optStr(300) }) },
  async (data, user) => {
    const a = await prisma.salaryAdvance.create({ data });
    await audit(user.id, "SALARY_ADVANCE", "SalaryAdvance", a.id, data);
    return { ok: true, message: "Salary advance recorded (pending approval)." };
  },
);

export const decideAdvance = action(
  { permission: "hr.leave.approve", revalidate: "/hr", schema: z.object({ id: zs.id(), decision: z.enum(["APPROVED", "REJECTED"]) }) },
  async ({ id, decision }, user) => {
    const a = await prisma.salaryAdvance.findUniqueOrThrow({ where: { id } });
    if (a.status !== "PENDING") throw new UserError("Already decided.");
    await prisma.salaryAdvance.update({ where: { id }, data: { status: decision, approvedById: user.id } });
    await audit(user.id, `ADVANCE_${decision}`, "SalaryAdvance", id);
    return { ok: true, message: `Advance ${decision.toLowerCase()}.` };
  },
);

/**
 * Prepares DRAFT payroll for a month for every active staff member with a basic salary.
 * PAYE and NSSF use the rates in src/lib/payroll.ts (Uganda, confirm annually with URA/NSSF).
 * Approved advances are recovered (up to 50% of net by default).
 */
export const preparePayroll = action(
  { permission: "payroll.manage", revalidate: "/hr/payroll", schema: z.object({ year: z.coerce.number().int().min(2020).max(2100), month: z.coerce.number().int().min(1).max(12) }) },
  async ({ year, month }, user) => {
    const staff = await prisma.staff.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE"] }, basicSalary: { gt: 0 } }, include: { advances: { where: { status: "APPROVED" } } } });
    let n = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of staff) {
        const existing = await tx.payrollRecord.findUnique({ where: { staffId_year_month: { staffId: s.id, year, month } } });
        if (existing && existing.status !== "DRAFT") continue;
        const basic = Number(s.basicSalary);
        const paye = payeMonthly(basic);
        const nssf = nssfEmployee(basic);
        const outstanding = s.advances.reduce((a, x) => a + Number(x.amount) - Number(x.recovered), 0);
        const advanceRecovery = Math.min(outstanding, Math.max(0, Math.floor((basic - paye - nssf) * 0.5)));
        const data = { basic, allowances: 0, paye, nssf, advanceRecovery, otherDeductions: 0, net: basic - paye - nssf - advanceRecovery };
        await tx.payrollRecord.upsert({ where: { staffId_year_month: { staffId: s.id, year, month } }, update: data, create: { staffId: s.id, year, month, ...data } });
        n++;
      }
      await audit(user.id, "PREPARE_PAYROLL", "PayrollRecord", `${year}-${month}`, { staff: n }, tx);
    });
    return { ok: true, message: `Draft payroll prepared for ${n} staff. Review, then approve.` };
  },
);

export const adjustPayslip = action(
  { permission: "payroll.manage", revalidate: "/hr/payroll", schema: z.object({ id: zs.id(), allowances: zs.money(), otherDeductions: zs.money() }) },
  async ({ id, allowances, otherDeductions }, user) => {
    const r = await prisma.payrollRecord.findUniqueOrThrow({ where: { id } });
    if (r.status !== "DRAFT") throw new UserError("Only draft payslips can be changed.");
    const gross = Number(r.basic) + allowances;
    const paye = payeMonthly(gross);
    const nssf = nssfEmployee(gross);
    const net = gross - paye - nssf - Number(r.advanceRecovery) - otherDeductions;
    if (net < 0) throw new UserError("Deductions exceed gross pay.");
    await prisma.payrollRecord.update({ where: { id }, data: { allowances, otherDeductions, paye, nssf, net } });
    await audit(user.id, "ADJUST_PAYSLIP", "PayrollRecord", id, { allowances, otherDeductions });
    return { ok: true, message: "Payslip updated." };
  },
);

export const approvePayroll = action(
  { permission: "payroll.manage", revalidate: "/hr/payroll", schema: z.object({ year: zs.int(), month: zs.int(), status: z.enum(["APPROVED", "PAID"]) }) },
  async ({ year, month, status }, user) => {
    if (status === "APPROVED" && !can(user, "finance.approve", "hr.leave.approve")) throw new UserError("Payroll approval needs the headteacher or an approver.");
    const from = status === "APPROVED" ? "DRAFT" : "APPROVED";
    const recs = await prisma.payrollRecord.findMany({ where: { year, month, status: from } });
    if (!recs.length) throw new UserError(`No ${from.toLowerCase()} payslips for this month.`);
    await prisma.$transaction(async (tx) => {
      await tx.payrollRecord.updateMany({ where: { id: { in: recs.map((r) => r.id) } }, data: { status, ...(status === "PAID" ? { paidAt: new Date() } : {}) } });
      if (status === "PAID") {
        // Apply advance recoveries
        for (const r of recs.filter((x) => Number(x.advanceRecovery) > 0)) {
          let left = Number(r.advanceRecovery);
          const advs = await tx.salaryAdvance.findMany({ where: { staffId: r.staffId, status: "APPROVED" }, orderBy: { date: "asc" } });
          for (const a of advs) {
            if (left <= 0) break;
            const take = Math.min(left, Number(a.amount) - Number(a.recovered));
            left -= take;
            const recovered = Number(a.recovered) + take;
            await tx.salaryAdvance.update({ where: { id: a.id }, data: { recovered, status: recovered >= Number(a.amount) ? "RECOVERED" : "APPROVED" } });
          }
        }
      }
      await audit(user.id, `PAYROLL_${status}`, "PayrollRecord", `${year}-${month}`, { count: recs.length }, tx);
    });
    return { ok: true, message: `${recs.length} payslip(s) ${status.toLowerCase()}.` };
  },
);

export const saveAppraisal = action(
  { permission: "staff.manage", revalidate: "/hr", schema: z.object({ staffId: zs.id(), period: zs.str(40), score: z.coerce.number().int().min(0).max(100), strengths: zs.optStr(1000), improvements: zs.optStr(1000) }) },
  async (data, user) => {
    const a = await prisma.staffAppraisal.create({ data: { ...data, appraiserId: user.id } });
    await audit(user.id, "APPRAISAL", "StaffAppraisal", a.id, { staffId: data.staffId, score: data.score });
    return { ok: true, message: "Appraisal recorded." };
  },
);
