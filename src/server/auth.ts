import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { PermissionCode } from "@/lib/permissions";
import { randomToken, sha256, verifyPassword } from "./passwords";
import { clientInfo } from "./request";

export const SESSION_COOKIE = "smis_session";
const SESSION_HOURS = 12;
const LOCKOUT_WINDOW_MIN = 15;
const MAX_FAILS_PER_USER = 5;
const MAX_FAILS_PER_IP = 30;

export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: Set<string>;
  staffId: string | null;
  studentId: string | null;
  guardianId: string | null;
  sessionId: string;
};

export class AuthError extends Error {
  constructor(message = "You are not allowed to perform this action.") {
    super(message);
  }
}

async function setSessionCookie(token: string, expires: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export type LoginResult = { ok: true; mustChangePassword: boolean; home: string } | { ok: false; error: string };

export async function login(usernameRaw: string, password: string): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase();
  const { ip, userAgent } = await clientInfo();
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000);

  const [userFails, ipFails] = await Promise.all([
    prisma.loginHistory.count({ where: { username, success: false, createdAt: { gte: since } } }),
    prisma.loginHistory.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (userFails >= MAX_FAILS_PER_USER || ipFails >= MAX_FAILS_PER_IP) {
    await prisma.loginHistory.create({ data: { username, success: false, reason: "RATE_LIMITED", ip, userAgent } });
    return { ok: false, error: `Too many failed attempts. Try again in ${LOCKOUT_WINDOW_MIN} minutes.` };
  }

  const user = await prisma.user.findUnique({ where: { username }, include: { roles: { include: { role: true } } } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH);
  if (!user || !valid) {
    await prisma.loginHistory.create({ data: { username, userId: user?.id, success: false, reason: "BAD_CREDENTIALS", ip, userAgent } });
    return { ok: false, error: "Invalid username or password." };
  }
  if (!user.isActive) {
    await prisma.loginHistory.create({ data: { username, userId: user.id, success: false, reason: "INACTIVE", ip, userAgent } });
    return { ok: false, error: "This account is deactivated. Contact the school administrator." };
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.$transaction([
    prisma.session.create({ data: { tokenHash: sha256(token), userId: user.id, ip, userAgent, expiresAt } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.loginHistory.create({ data: { username, userId: user.id, success: true, ip, userAgent } }),
  ]);
  await setSessionCookie(token, expiresAt);
  const roles = user.roles.map((r) => r.role.code);
  return { ok: true, mustChangePassword: user.mustChangePassword, home: homeFor(roles) };
}

// Constant-time-ish path for unknown usernames.
const DUMMY_HASH = "$2a$12$ObzxLXvGgw8uJpJY80tio.5dmrsD/itsjSdXBiRZIDMI2hkKPttFG";

export function homeFor(roles: string[]) {
  const staffRoles = roles.filter((r) => r !== "PARENT" && r !== "STUDENT");
  if (staffRoles.length > 0) return "/dashboard";
  if (roles.includes("PARENT")) return "/portal/parent";
  if (roles.includes("STUDENT")) return "/portal/student";
  return "/dashboard";
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Loads the signed-in user (once per request). Permissions come from the DB, so
 *  deactivation and role changes take effect immediately. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          staff: { select: { id: true } },
          student: { select: { id: true } },
          guardian: { select: { id: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

  // Sliding expiry, written at most every 10 minutes to limit DB writes.
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    });
  }

  const u = session.user;
  const permissions = new Set<string>();
  for (const ur of u.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    mustChangePassword: u.mustChangePassword,
    roles: u.roles.map((r) => r.role.code),
    permissions,
    staffId: u.staff?.id ?? null,
    studentId: u.student?.id ?? null,
    guardianId: u.guardian?.id ?? null,
    sessionId: session.id,
  };
});

export function can(user: CurrentUser | null, ...codes: PermissionCode[]) {
  return !!user && codes.some((c) => user.permissions.has(c));
}

/** For pages: redirect to login when signed out, show 403 page when not permitted. */
export async function requirePage(...codes: PermissionCode[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (codes.length && !can(user, ...codes)) redirect("/forbidden");
  return user;
}

/** For server actions / route handlers: throws AuthError. */
export async function requireUser(...codes: PermissionCode[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (codes.length && !can(user, ...codes)) throw new AuthError();
  return user;
}
