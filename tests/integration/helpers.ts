import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/server/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const RUN = `T${Date.now().toString(36).toUpperCase()}`;

export async function adminUser(): Promise<CurrentUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { username: "admin" } });
  return {
    id: u.id, username: u.username, fullName: u.fullName, email: u.email, mustChangePassword: false, roles: ["ADMIN"],
    permissions: new Set(Object.keys(PERMISSIONS)), staffId: null, studentId: null, guardianId: null, sessionId: "test",
  };
}

/** An isolated O-Level class with two streams for this test run. */
export async function testClass(order: number, level: "O_LEVEL" | "A_LEVEL" = "O_LEVEL") {
  const code = `${RUN}-${order}`;
  const cls = await prisma.schoolClass.create({ data: { code, name: `Test ${code}`, level, order: 1000 + Math.floor(Math.random() * 1e6), streams: { create: [{ name: "A" }, { name: "B" }] } }, include: { streams: { orderBy: { name: "asc" } } } });
  return cls;
}

let n = 0;
export async function student(classId: string, streamId: string, extra: Record<string, unknown> = {}) {
  n++;
  const year = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  return prisma.student.create({
    data: {
      admissionNo: `${RUN}/${n}`, firstName: `F${n}`, lastName: `L${n}`, gender: n % 2 ? "MALE" : "FEMALE", admissionDate: new Date("2026-02-02"), classId, streamId, ...extra,
      enrollments: { create: [{ academicYearId: year.id, classId, streamId }] },
    },
  });
}

export async function currentYearAndTerm() {
  const year = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const term = await prisma.term.findFirstOrThrow({ where: { isCurrent: true } });
  return { year, term };
}
