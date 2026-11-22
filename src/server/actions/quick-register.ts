"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { generateAdmissionNo, defaultSubjectIds, assertStreamInClass, currentYearOrThrow } from "../students";
import { normaliseQuickRow, quickRowProblems, type QuickRow } from "@/lib/quick-register";

const quickRow = z.object({
  lastName: z.string().max(60).default(""), firstName: z.string().max(60).default(""), otherNames: z.string().max(60).default(""),
  gender: z.string().max(10).default(""), residence: z.string().max(12).default(""), dateOfBirth: z.string().max(12).default(""),
  linNumber: z.string().max(30).default(""), houseId: z.string().max(40).default(""), combinationId: z.string().max(40).default(""),
  guardianName: z.string().max(120).default(""), guardianPhone: z.string().max(20).default(""),
});

/**
 * Students → Quick registration: many students of one class/stream in one go (typed or pasted from Excel).
 * Each gets an admission number, this year's enrolment, default subjects (O-Level compulsory / A-Level combination),
 * optional house and parent. All rows are checked first; nothing is saved if any row has a problem.
 */
export const quickRegisterStudents = action(
  {
    permission: "students.manage", revalidate: "/students",
    schema: z.object({ classId: zs.id(), streamId: zs.id(), admissionDate: zs.date(), allowDuplicates: zs.bool(), rows: z.string().max(2_000_000) }),
  },
  async ({ classId, streamId, admissionDate, allowDuplicates, rows: raw }, user) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new UserError("Could not read the rows. Reload the page and try again."); }
    const rows: QuickRow[] = z.array(quickRow).max(500).parse(parsed).map(normaliseQuickRow).filter((r) => r.lastName || r.firstName);
    if (!rows.length) throw new UserError("Type at least one student (surname and first name).");

    const [cls, houses, combos, existing] = await Promise.all([
      prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } }),
      prisma.house.findMany({ select: { id: true } }),
      prisma.subjectCombination.findMany({ where: { isActive: true }, select: { id: true } }),
      prisma.student.findMany({ where: { classId, status: "ACTIVE" }, select: { firstName: true, lastName: true, admissionNo: true } }),
    ]);
    const problems = quickRowProblems(rows, {
      aLevel: cls.level === "A_LEVEL", houseIds: new Set(houses.map((h) => h.id)), combinationIds: new Set(combos.map((c) => c.id)),
      existing: allowDuplicates ? [] : existing,
    });
    if (problems.length) {
      const dup = problems.some((p) => p.includes("already in"));
      throw new UserError(`Nothing was saved — fix ${problems.length === 1 ? "this" : "these"} first: ${problems.slice(0, 6).join(" · ")}${problems.length > 6 ? ` · …and ${problems.length - 6} more` : ""}${dup ? " (tick “Register even if the name already exists” if they really are different learners)." : ""}`);
    }

    const created = await prisma.$transaction(async (tx) => {
      await assertStreamInClass(tx, classId, streamId);
      const year = await currentYearOrThrow(tx);
      const out: string[] = [];
      const subjectsFor = new Map<string, string[]>();
      for (const r of rows) {
        const combinationId = cls.level === "A_LEVEL" ? r.combinationId || null : null;
        const admissionNo = await generateAdmissionNo(tx, admissionDate.getUTCFullYear());
        const s = await tx.student.create({
          data: {
            admissionNo, lastName: r.lastName, firstName: r.firstName, otherNames: r.otherNames || null, gender: r.gender as "MALE" | "FEMALE",
            residence: r.residence as "DAY" | "BOARDING", dateOfBirth: r.dateOfBirth ? new Date(`${r.dateOfBirth}T00:00:00Z`) : null,
            linNumber: r.linNumber || null, houseId: r.houseId || null, combinationId, classId, streamId, admissionDate,
          },
        });
        await tx.enrollment.create({ data: { studentId: s.id, academicYearId: year.id, classId, streamId } });
        const key = combinationId ?? "-";
        if (!subjectsFor.has(key)) subjectsFor.set(key, await defaultSubjectIds(tx, classId, combinationId));
        const subjectIds = subjectsFor.get(key)!;
        if (subjectIds.length) await tx.studentSubject.createMany({ data: subjectIds.map((subjectId) => ({ studentId: s.id, subjectId, academicYearId: year.id })) });
        if (r.guardianName && r.guardianPhone) {
          const g = (await tx.guardian.findFirst({ where: { phone: r.guardianPhone, fullName: { equals: r.guardianName, mode: "insensitive" } } }))
            ?? (await tx.guardian.create({ data: { fullName: r.guardianName, phone: r.guardianPhone } }));
          await tx.studentGuardian.create({ data: { studentId: s.id, guardianId: g.id, relationship: "Parent", isPrimary: true } });
        }
        out.push(admissionNo);
      }
      await audit(user.id, "QUICK_REGISTER", "Student", null, { classId, streamId, count: out.length, admissionNos: out }, tx);
      return out;
    }, { timeout: 120_000 });
    const range = created.length > 1 ? `${created[0]} to ${created[created.length - 1]}` : created[0];
    return { ok: true, message: `${created.length} student${created.length === 1 ? "" : "s"} registered (${range}).` };
  },
);
