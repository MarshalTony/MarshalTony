import { prisma } from "@/lib/db";

/**
 * Whether mark sheets must be submitted and approved by the DOS before they count.
 * Off by default (Settings → School profile → Marks): saved marks count immediately and
 * the DOS ends entry by closing the examination.
 */
export async function marksApprovalRequired(): Promise<boolean> {
  const s = await prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { reportTemplate: true } });
  return (s?.reportTemplate as { requireMarksApproval?: boolean } | null)?.requireMarksApproval === true;
}
