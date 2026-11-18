"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, login, logout, homeFor } from "../auth";
import { describeError, formToObject, type ActionResult } from "../action";
import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "../passwords";
import { audit } from "../audit";
import { sendMessage } from "../messaging";

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { username, password } = formToObject(fd) as { username?: string; password?: string };
  if (!username || !password) return { ok: false, error: "Enter your username and password." };
  const r = await login(username, password);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, redirect: r.mustChangePassword ? "/change-password" : r.home };
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await logout();
  if (user) await audit(user.id, "LOGOUT", "User", user.id);
  redirect("/login");
}

export async function changePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const input = z.object({ current: z.string().min(1), password: z.string(), confirm: z.string() }).parse(formToObject(fd));
    if (input.password !== input.confirm) return { ok: false, error: "The new passwords do not match." };
    const problem = passwordProblem(input.password);
    if (problem) return { ok: false, error: problem };
    const db = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(input.current, db.passwordHash))) return { ok: false, error: "Your current password is incorrect." };
    if (await verifyPassword(input.password, db.passwordHash)) return { ok: false, error: "Choose a password different from the current one." };
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.password), mustChangePassword: false } }),
      // sign out every other device
      prisma.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } }),
    ]);
    await audit(user.id, "PASSWORD_CHANGED", "User", user.id);
    return { ok: true, message: "Password changed.", redirect: homeFor(user.roles) };
  } catch (e) {
    return describeError(e);
  }
}

export async function requestResetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { identifier } = formToObject(fd) as { identifier?: string };
  const generic: ActionResult = { ok: true, message: "If an account with an email address matches, a reset link has been sent. Otherwise contact the school administrator." };
  if (!identifier) return { ok: false, error: "Enter your username or email." };
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ username: id }, { email: id }], isActive: true } });
  if (!user?.email) return generic;
  const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 3) return generic;
  const token = randomToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const link = `${process.env.APP_URL ?? ""}/reset-password?token=${token}`;
  await sendMessage({
    channel: "EMAIL", to: user.email, toName: user.fullName, subject: "Reset your SMIS password", category: "PASSWORD",
    body: `Hello ${user.fullName},\n\nUse this link within 1 hour to set a new password:\n${link}\n\nIf you did not ask for this, ignore this email.\n\nBishop Ogez High School`,
  });
  return generic;
}

export async function resetPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { token, password, confirm } = formToObject(fd) as Record<string, string | undefined>;
  if (!token) return { ok: false, error: "Invalid reset link." };
  if (password !== confirm) return { ok: false, error: "The passwords do not match." };
  const problem = passwordProblem(password ?? "");
  if (problem) return { ok: false, error: problem };
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return { ok: false, error: "This reset link is invalid or has expired." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password!), mustChangePassword: false } }),
    prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: rec.userId } }),
  ]);
  await audit(rec.userId, "PASSWORD_RESET", "User", rec.userId);
  return { ok: true, message: "Password updated. Please sign in.", redirect: "/login" };
}
