import "server-only";
import { prisma } from "@/lib/db";
import { can, type CurrentUser } from "../auth";

/** Staff with fee rights, the student themself, or a linked guardian. */
export async function canSeeStudentFees(user: CurrentUser, studentId: string) {
  if (can(user, "fees.view", "fees.collect")) return true;
  if (user.studentId === studentId) return true;
  if (user.guardianId) return !!(await prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: user.guardianId } } }));
  return false;
}
