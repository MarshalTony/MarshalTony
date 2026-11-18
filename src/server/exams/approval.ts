import "server-only";
import { prisma } from "@/lib/db";
import { generateResults } from "./results";
import { marksApprovalRequired } from "./approval-setting";

export { marksApprovalRequired };

/**
 * When approval is not required, (re)generate an exam's results if marks were saved since the last
 * generation, so report cards always show what teachers entered. Returns true if it regenerated.
 */
export async function ensureFreshResults(examId: string): Promise<boolean> {
  if (await marksApprovalRequired()) return false;
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { isComposite: true, resultsGeneratedAt: true, _count: { select: { classes: true, subjects: true } } } });
  if (!exam || exam.isComposite || !exam._count.classes || !exam._count.subjects) return false;
  const last = await prisma.mark.aggregate({ where: { examId }, _max: { updatedAt: true } });
  const lastMark = last._max.updatedAt;
  if (!lastMark || (exam.resultsGeneratedAt && lastMark <= exam.resultsGeneratedAt)) return false;
  await generateResults(examId);
  return true;
}
