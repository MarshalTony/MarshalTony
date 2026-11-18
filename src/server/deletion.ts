import "server-only";
import { prisma } from "@/lib/db";
import { UserError } from "./action";
import { audit } from "./audit";

/**
 * Permanent deletion is only for records created by mistake. Anything that already
 * has school history is refused, so report cards, receipts and audits stay intact.
 * Those people should be given a status instead (student: withdrawn/transferred/graduated;
 * staff: exited), which keeps the record but removes them from active lists.
 */

function list(items: [string, number][]) {
  return items.filter(([, n]) => n > 0).map(([label, n]) => `${n} ${label}`).join(", ");
}

export async function studentHistory(studentId: string) {
  const w = { studentId };
  const [activities, marks, results, attendance, invoices, payments, ledger, adjustments, loans, incidents, counselling, medical, transport, uneb] = await Promise.all([
    prisma.activityScore.count({ where: w }), prisma.mark.count({ where: w }), prisma.examResult.count({ where: w }), prisma.studentAttendance.count({ where: w }),
    prisma.invoice.count({ where: w }), prisma.payment.count({ where: w }), prisma.ledgerEntry.count({ where: w }),
    prisma.feeAdjustment.count({ where: w }), prisma.libraryLoan.count({ where: w }), prisma.disciplineIncident.count({ where: w }),
    prisma.counsellingRecord.count({ where: w }), prisma.medicalIncident.count({ where: w }), prisma.studentTransport.count({ where: w }),
    prisma.unebCandidate.count({ where: w }),
  ]);
  return list([
    ["activity scores", activities], ["exam marks", marks], ["exam results", results], ["attendance records", attendance], ["invoices", invoices], ["payments", payments],
    ["fees transactions", ledger], ["fee adjustments", adjustments], ["library loans", loans], ["discipline records", incidents],
    ["counselling records", counselling], ["medical records", medical], ["transport allocations", transport], ["UNEB records", uneb],
  ]);
}

export async function deleteStudentRecord(studentId: string, userId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId } });
  if (!s) throw new UserError("Student not found.");
  const history = await studentHistory(studentId);
  if (history) {
    throw new UserError(
      `${s.firstName} ${s.lastName} cannot be deleted because the record has history (${history}). ` +
        "Use Change status (Withdrawn, Transferred or Graduated) instead — the record is kept but leaves the active lists.",
    );
  }
  await prisma.$transaction(async (tx) => {
    // Subjects, enrolments and guardian links cascade. The portal login (if any) is
    // deactivated rather than deleted so the audit trail keeps its author.
    if (s.userId) await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
    await tx.session.deleteMany({ where: { userId: s.userId ?? "-" } });
    await tx.student.delete({ where: { id: studentId } });
    if (s.photoFileId) await tx.storedFile.deleteMany({ where: { id: s.photoFileId } });
    await audit(userId, "DELETE", "Student", studentId, { admissionNo: s.admissionNo, name: `${s.lastName} ${s.firstName}` }, tx);
  });
  return s;
}

export async function staffHistory(staffId: string) {
  const w = { staffId };
  const [allocations, timetable, attendance, leaves, payroll, advances, appraisals, loans, driver, classTeacher] = await Promise.all([
    prisma.teacherAllocation.count({ where: w }), prisma.timetableSlot.count({ where: w }), prisma.staffAttendance.count({ where: w }),
    prisma.leaveRequest.count({ where: w }), prisma.payrollRecord.count({ where: w }), prisma.salaryAdvance.count({ where: w }),
    prisma.staffAppraisal.count({ where: w }), prisma.libraryLoan.count({ where: w }), prisma.driver.count({ where: w }),
    prisma.stream.count({ where: { classTeacherId: staffId } }),
  ]);
  return list([
    ["subject allocations", allocations], ["timetable periods", timetable], ["attendance records", attendance], ["leave requests", leaves],
    ["payslips", payroll], ["salary advances", advances], ["appraisals", appraisals], ["library loans", loans],
    ["driver records", driver], ["class-teacher posts", classTeacher],
  ]);
}

export async function deleteStaffRecord(staffId: string, userId: string) {
  const st = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!st) throw new UserError("Staff member not found.");
  if (st.userId && st.userId === userId) throw new UserError("You cannot delete your own staff record.");
  const history = await staffHistory(staffId);
  if (history) {
    throw new UserError(
      `${st.firstName} ${st.lastName} cannot be deleted because the record has history (${history}). ` +
        "Edit the record and set the status to Exited instead — this also disables their login.",
    );
  }
  await prisma.$transaction(async (tx) => {
    // Qualifications and teaching subjects cascade. A linked login is deactivated (kept for the audit trail).
    if (st.userId) {
      await tx.user.update({ where: { id: st.userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId: st.userId } });
    }
    await tx.staff.delete({ where: { id: staffId } });
    if (st.photoFileId) await tx.storedFile.deleteMany({ where: { id: st.photoFileId } });
    await audit(userId, "DELETE", "Staff", staffId, { staffNo: st.staffNo, name: `${st.lastName} ${st.firstName}` }, tx);
  });
  return st;
}
