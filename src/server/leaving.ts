import "server-only";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "./auth";
import type { PermissionCode } from "@/lib/permissions";

export const OFFICES = [
  { code: "BURSAR", label: "Bursar (fees)", perms: ["fees.collect", "fees.manage"] },
  { code: "LIBRARY", label: "Library", perms: ["library.manage"] },
  { code: "STORES", label: "Stores (items issued)", perms: ["inventory.manage"] },
  { code: "DISCIPLINE", label: "Discipline", perms: ["discipline.manage"] },
  { code: "CLASS_TEACHER", label: "Class teacher", perms: [] },
] as const satisfies readonly { code: string; label: string; perms: PermissionCode[] }[];
export type OfficeCode = (typeof OFFICES)[number]["code"];
export const OFFICE_CODES = OFFICES.map((o) => o.code) as OfficeCode[];

export const LEAVING_REASONS = [
  { value: "COMPLETED", label: "Completed studies (S4 / S6)", status: "GRADUATED" },
  { value: "TRANSFERRED", label: "Transferred to another school", status: "TRANSFERRED" },
  { value: "WITHDRAWN", label: "Withdrawn by parent", status: "WITHDRAWN" },
  { value: "EXPELLED", label: "Expelled", status: "EXPELLED" },
] as const;
export const CONDUCT = ["Excellent", "Very good", "Good", "Fair", "Poor"] as const;
/** Plain arrays for Zod enums (callbacks are not allowed in "use server" files). */
export const LEAVING_REASON_CODES = LEAVING_REASONS.map((r) => r.value) as [string, ...string[]];
export const CONDUCT_CODES = [...CONDUCT] as [string, ...string[]];

/** What the system can see for an office: an issue (if any) and a short description. */
export type Check = { issue: string | null; info: string };
export type ClearanceRow = {
  office: OfficeCode; label: string; check: Check;
  cleared: { by: string; at: Date; note: string | null } | null;
};

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;

/** Automatic checks and sign-offs for many students at once (used by the profile page and the class board). */
export async function clearanceFor(studentIds: string[]): Promise<Map<string, ClearanceRow[]>> {
  if (!studentIds.length) return new Map();
  const [ledger, loans, incidents, signs] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _sum: { debit: true, credit: true } }),
    prisma.libraryLoan.findMany({ where: { studentId: { in: studentIds }, OR: [{ returnedAt: null }, { finePaid: false, fineAmount: { gt: 0 } }] }, include: { book: { select: { title: true } } } }),
    prisma.disciplineIncident.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds }, status: "OPEN" }, _count: true }),
    prisma.studentClearance.findMany({ where: { studentId: { in: studentIds } } }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(signs.map((x) => x.clearedById))] } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));

  const out = new Map<string, ClearanceRow[]>();
  for (const id of studentIds) {
    const l = ledger.find((x) => x.studentId === id);
    const balance = Math.round((Number(l?._sum.debit ?? 0) - Number(l?._sum.credit ?? 0)) * 100) / 100;
    const myLoans = loans.filter((x) => x.studentId === id);
    const out_ = myLoans.filter((x) => !x.returnedAt);
    const fines = myLoans.filter((x) => !x.finePaid).reduce((a, x) => a + Number(x.fineAmount), 0);
    const open = incidents.find((x) => x.studentId === id)?._count ?? 0;
    const checks: Record<OfficeCode, Check> = {
      BURSAR: balance > 0 ? { issue: `Owes ${ugx(balance)}`, info: "" } : { issue: null, info: balance < 0 ? `In credit ${ugx(-balance)}` : "Fees fully paid" },
      LIBRARY: out_.length || fines > 0
        ? { issue: [out_.length ? `${out_.length} book(s) not returned: ${out_.slice(0, 3).map((x) => x.book.title).join(", ")}${out_.length > 3 ? "…" : ""}` : "", fines > 0 ? `unpaid fines ${ugx(fines)}` : ""].filter(Boolean).join("; "), info: "" }
        : { issue: null, info: "No books outstanding" },
      STORES: { issue: null, info: "Check items issued (uniform, mattress, tools…)" },
      DISCIPLINE: open ? { issue: `${open} open discipline case(s)`, info: "" } : { issue: null, info: "No open cases" },
      CLASS_TEACHER: { issue: null, info: "Report book, school property, farewell" },
    };
    out.set(id, OFFICES.map((o) => {
      const sgn = signs.find((x) => x.studentId === id && x.office === o.code);
      return { office: o.code, label: o.label, check: checks[o.code], cleared: sgn ? { by: users.get(sgn.clearedById) ?? "—", at: sgn.clearedAt, note: sgn.note } : null };
    }));
  }
  return out;
}

/** Offices this user may sign for this student (class teacher: their own stream; administrators: all). */
export async function officesUserMayClear(user: CurrentUser, student: { streamId: string }): Promise<Set<OfficeCode>> {
  const out = new Set<OfficeCode>();
  const admin = user.permissions.has("students.manage") && user.permissions.has("settings.manage");
  for (const o of OFFICES) {
    if (admin || o.perms.some((p) => user.permissions.has(p))) out.add(o.code);
  }
  if (!out.has("CLASS_TEACHER")) {
    if (user.permissions.has("students.manage")) out.add("CLASS_TEACHER");
    else if (user.staffId) {
      const st = await prisma.stream.findUnique({ where: { id: student.streamId }, select: { classTeacherId: true } });
      if (st?.classTeacherId === user.staffId) out.add("CLASS_TEACHER");
    }
  }
  return out;
}
