import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { deleteStaffRecord, deleteStudentRecord } from "@/server/deletion";
import { postInvoice } from "@/server/fees/ledger";
import { adminUser, currentYearAndTerm, RUN, student, testClass } from "./helpers";

describe("deleting students and staff", async () => {
  const user = await adminUser();
  const { year, term } = await currentYearAndTerm();
  const cls = await testClass(6);

  it("deletes a student entered by mistake, with subjects, enrolment and guardian links", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });
    await prisma.studentSubject.create({ data: { studentId: s.id, subjectId: eng.id, academicYearId: year.id } });
    const g = await prisma.guardian.create({ data: { fullName: `G ${RUN}`, phone: "0700000001", students: { create: { studentId: s.id, relationship: "Mother" } } } });
    await deleteStudentRecord(s.id, user.id);
    expect(await prisma.student.findUnique({ where: { id: s.id } })).toBeNull();
    expect(await prisma.studentSubject.count({ where: { studentId: s.id } })).toBe(0);
    expect(await prisma.enrollment.count({ where: { studentId: s.id } })).toBe(0);
    expect(await prisma.guardian.findUnique({ where: { id: g.id } })).not.toBeNull(); // guardian kept for siblings
    expect(await prisma.auditLog.count({ where: { action: "DELETE", entity: "Student", entityId: s.id } })).toBe(1);
  });

  it("refuses to delete a student with fees history and explains the alternative", async () => {
    const s = await student(cls.id, cls.streams[0].id);
    await prisma.$transaction((tx) => postInvoice(tx, { studentId: s.id, termId: term.id, userId: user.id, lines: [{ description: "Tuition", amount: 1000 }] }));
    await expect(deleteStudentRecord(s.id, user.id)).rejects.toThrow(/1 invoices.*Change status/);
    expect(await prisma.student.findUnique({ where: { id: s.id } })).not.toBeNull();
  });

  it("deactivates (not deletes) a deleted student's portal login", async () => {
    const u = await prisma.user.create({ data: { username: `del-${RUN}`.toLowerCase(), fullName: "Del", passwordHash: "x" } });
    const s = await student(cls.id, cls.streams[0].id, { userId: u.id });
    await deleteStudentRecord(s.id, user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).isActive).toBe(false);
  });

  it("deletes staff without history but refuses staff with allocations", async () => {
    const a = await prisma.staff.create({ data: { staffNo: `${RUN}-D1`, firstName: "A", lastName: "Mistake", gender: "MALE", designation: "Teacher" } });
    await deleteStaffRecord(a.id, user.id);
    expect(await prisma.staff.findUnique({ where: { id: a.id } })).toBeNull();
    const b = await prisma.staff.create({ data: { staffNo: `${RUN}-D2`, firstName: "B", lastName: "Teaching", gender: "FEMALE", designation: "Teacher" } });
    const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });
    await prisma.teacherAllocation.create({ data: { staffId: b.id, subjectId: eng.id, streamId: cls.streams[0].id, academicYearId: year.id } });
    await expect(deleteStaffRecord(b.id, user.id)).rejects.toThrow(/1 subject allocations.*Exited/);
  });
});
