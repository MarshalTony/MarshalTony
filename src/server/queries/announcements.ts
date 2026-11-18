import { prisma } from "@/lib/db";
import type { CurrentUser } from "../auth";

export function audiencesFor(user: CurrentUser) {
  const a = ["ALL"];
  if (user.staffId || user.roles.some((r) => r !== "PARENT" && r !== "STUDENT")) a.push("STAFF");
  if (user.roles.includes("PARENT")) a.push("PARENTS");
  if (user.roles.includes("STUDENT")) a.push("STUDENTS");
  return a;
}

export function visibleAnnouncements(user: CurrentUser, take = 20, classIds?: string[]) {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      audience: { in: audiencesFor(user) },
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      AND: classIds ? [{ OR: [{ classId: null }, { classId: { in: classIds } }] }] : undefined,
    },
    orderBy: [{ isUrgent: "desc" }, { publishedAt: "desc" }],
    take,
  });
}
