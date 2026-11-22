"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";

/** Students → Confirm students: mark the ticked students as having reported for the term. */
export const confirmStudents = action(
  { permission: "students.manage", schema: z.object({ termId: zs.id(), studentIds: zs.ids() }) },
  async ({ termId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the students who have reported.");
    const term = await prisma.term.findUniqueOrThrow({ where: { id: termId }, include: { academicYear: true } });
    const { count } = await prisma.studentConfirmation.createMany({ data: studentIds.map((studentId) => ({ studentId, termId, confirmedById: user.id })), skipDuplicates: true });
    await audit(user.id, "CONFIRM_STUDENTS", "Term", termId, { count, studentIds: studentIds.slice(0, 300) });
    return { ok: true, message: `${count} student(s) confirmed for ${term.name} ${term.academicYear.name}.` };
  },
);

export const unconfirmStudents = action(
  { permission: "students.manage", schema: z.object({ termId: zs.id(), studentIds: zs.ids() }) },
  async ({ termId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the students to mark as not reported.");
    const { count } = await prisma.studentConfirmation.deleteMany({ where: { termId, studentId: { in: studentIds } } });
    await audit(user.id, "UNCONFIRM_STUDENTS", "Term", termId, { count, studentIds: studentIds.slice(0, 300) });
    return { ok: true, message: `${count} confirmation(s) removed.` };
  },
);
