import "server-only";
import { prisma } from "@/lib/db";
import { UserError } from "./action";
import { can, type CurrentUser } from "./auth";

/** Subject teachers may only work on subjects they are allocated to (in the stream, or in any stream of the class). */
export async function assertMayEnter(user: CurrentUser, termId: string, subjectId: string, where: { streamId?: string; classId?: string }) {
  const term = await prisma.term.findUniqueOrThrow({ where: { id: termId } });
  const elevated = can(user, "marks.enter.any", "marks.approve");
  if (!term.isCurrent && !elevated) throw new UserError("This term is closed. Ask the Director of Studies to make changes.");
  if (elevated) return term;
  if (!can(user, "marks.enter") || !user.staffId) throw new UserError("You are not allowed to enter assessment scores.");
  const alloc = await prisma.teacherAllocation.findFirst({
    where: { staffId: user.staffId, subjectId, academicYearId: term.academicYearId, ...(where.streamId ? { streamId: where.streamId } : { stream: { classId: where.classId } }) },
  });
  if (!alloc) throw new UserError("You are not allocated to teach this subject in this class.");
  return term;
}

