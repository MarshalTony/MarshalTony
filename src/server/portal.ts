import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, type CurrentUser } from "./auth";

export async function requirePortal(kind: "parent" | "student"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (kind === "parent" && (!user.permissions.has("portal.parent") || !user.guardianId)) redirect("/forbidden");
  if (kind === "student" && (!user.permissions.has("portal.student") || !user.studentId)) redirect("/forbidden");
  return user;
}

/** Returns the child only if linked to this parent; otherwise 404 (never reveals other families' records). */
export async function childOf(user: CurrentUser, studentId: string) {
  if (!user.guardianId) notFound();
  const link = await prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: user.guardianId } } });
  if (!link) notFound();
  return link;
}
