"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { nextDocNo } from "../counters";
import { clearanceFor, officesUserMayClear, OFFICE_CODES, LEAVING_REASONS, LEAVING_REASON_CODES, CONDUCT_CODES } from "../leaving";

/** One office signs a student's clearance. If the system sees an issue (e.g. fees owed), a note is required. */
export const clearOffice = action(
  { permission: null, revalidate: "/students", schema: z.object({ studentId: zs.id(), office: z.enum(OFFICE_CODES as [string, ...string[]]), note: zs.optStr(300) }) },
  async ({ studentId, office, note }, user) => {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { streamId: true, firstName: true, lastName: true } });
    if (!(await officesUserMayClear(user, student)).has(office as any)) throw new UserError("You cannot sign this part of the clearance.");
    const row = (await clearanceFor([studentId])).get(studentId)!.find((r) => r.office === office)!;
    if (row.check.issue && !note) throw new UserError(`${row.check.issue}. Add a note to clear anyway (e.g. "parent to pay by 30 Jan").`);
    await prisma.studentClearance.upsert({
      where: { studentId_office: { studentId, office } },
      update: { clearedById: user.id, clearedAt: new Date(), note: note ?? null },
      create: { studentId, office, clearedById: user.id, note: note ?? null },
    });
    await audit(user.id, "CLEARANCE_SIGNED", "Student", studentId, { office, note, issue: row.check.issue });
    return { ok: true, message: `${row.label} cleared for ${student.lastName} ${student.firstName}.` };
  },
);

export const unclearOffice = action(
  { permission: null, revalidate: "/students", schema: z.object({ studentId: zs.id(), office: z.enum(OFFICE_CODES as [string, ...string[]]) }) },
  async ({ studentId, office }, user) => {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { streamId: true } });
    if (!(await officesUserMayClear(user, student)).has(office as any)) throw new UserError("You cannot change this part of the clearance.");
    await prisma.studentClearance.deleteMany({ where: { studentId, office } });
    await audit(user.id, "CLEARANCE_UNDONE", "Student", studentId, { office });
    return { ok: true, message: "Clearance removed." };
  },
);

/**
 * Records (or corrects) a student's leaving: issues a certificate number once, and sets the status
 * (Graduated / Transferred / Withdrawn / Expelled), exit date and reason as "Change status" does.
 */
export const saveLeaving = action(
  {
    permission: "students.manage", revalidate: "/students",
    schema: z.object({
      studentId: zs.id(), leavingDate: zs.date(),
      reason: z.enum(LEAVING_REASON_CODES),
      conduct: z.enum(CONDUCT_CODES),
      remarks: zs.optStr(600), destinationSchool: zs.optStr(150), override: zs.bool(),
    }),
  },
  async (d, user) => {
    const rows = (await clearanceFor([d.studentId])).get(d.studentId)!;
    const pending = rows.filter((r) => !r.cleared);
    if (pending.length && !d.override) throw new UserError(`Clearance is not complete (${pending.map((p) => p.label).join(", ")}). Tick "issue anyway" to continue.`);
    const status = LEAVING_REASONS.find((r) => r.value === d.reason)!.status;
    const rec = await prisma.$transaction(async (tx) => {
      const s = await tx.student.findUniqueOrThrow({ where: { id: d.studentId }, include: { schoolClass: true, stream: true, leavingRecord: true } });
      const data = {
        leavingDate: d.leavingDate, reason: d.reason, conduct: d.conduct, remarks: d.remarks ?? null,
        destinationSchool: d.destinationSchool ?? null, lastClass: s.leavingRecord?.lastClass ?? `${s.schoolClass.name} ${s.stream.name}`,
      };
      const rec = s.leavingRecord
        ? await tx.leavingRecord.update({ where: { studentId: s.id }, data })
        : await tx.leavingRecord.create({ data: { ...data, studentId: s.id, certificateNo: await nextDocNo(tx, "LC", d.leavingDate.getFullYear(), 4), issuedById: user.id } });
      const exitReason = [LEAVING_REASONS.find((r) => r.value === d.reason)!.label, d.destinationSchool].filter(Boolean).join(" — ");
      await tx.student.update({ where: { id: s.id }, data: { status, exitDate: d.leavingDate, exitReason } });
      const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (year) await tx.enrollment.updateMany({ where: { studentId: s.id, academicYearId: year.id }, data: { status: status === "GRADUATED" ? "COMPLETED" : "WITHDRAWN" } });
      if (s.userId) await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
      await audit(user.id, s.leavingRecord ? "LEAVING_UPDATED" : "LEAVING_RECORDED", "Student", s.id, { certificateNo: rec.certificateNo, reason: d.reason, status, pendingClearance: pending.map((p) => p.office) }, tx);
      return rec;
    });
    return { ok: true, message: `Leaving recorded — certificate ${rec.certificateNo}.` };
  },
);
