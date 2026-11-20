import "server-only";
import { marksApprovalRequired } from "./approval-setting";
import type { Tx } from "@/lib/db";
import { validateScore } from "@/lib/exams/engine";
import { UserError } from "../action";
import type { CurrentUser } from "../auth";

export type MarkEntry = { studentId: string; score: number | null; status: "PRESENT" | "ABSENT" | "EXEMPTED" };

/** Can this user enter marks for this stream/subject in this year? */
export async function canEnterMarks(tx: Tx, user: CurrentUser, streamId: string, subjectId: string, academicYearId: string) {
  if (user.permissions.has("marks.enter.any")) return true;
  if (!user.permissions.has("marks.enter") || !user.staffId) return false;
  const alloc = await tx.teacherAllocation.findFirst({ where: { staffId: user.staffId, streamId, subjectId, academicYearId } });
  return !!alloc;
}

/** Parses a typed cell: number, "ABS"/"A" (absent), "EX"/"X" (exempted), or empty (no mark). */
export function parseMarkInput(raw: string): { score: number | null; status: MarkEntry["status"] } | null | "invalid" {
  const v = raw.trim().toUpperCase();
  if (v === "") return null;
  if (["ABS", "A", "ABSENT"].includes(v)) return { score: null, status: "ABSENT" };
  if (["EX", "X", "EXEMPT", "EXEMPTED"].includes(v)) return { score: null, status: "EXEMPTED" };
  const n = Number(v);
  if (!Number.isFinite(n)) return "invalid";
  return { score: Math.round(n * 100) / 100, status: "PRESENT" };
}

/**
 * Saves marks for one exam/stream/subject. Blocks edits once submitted or approved,
 * unless `correction` is set (users with marks.approve), in which case every change
 * is written to the audit log with old and new values.
 */
export async function saveMarks(
  tx: Tx,
  args: { examId: string; streamId: string; subjectId: string; entries: MarkEntry[]; clear: string[]; user: CurrentUser; correction?: boolean; reason?: string },
) {
  const { examId, streamId, subjectId, entries, clear, user } = args;
  const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: true } });
  if (exam.isComposite) throw new UserError("Marks for a combined exam are calculated from its component exams.");
  // Examinations stay open for marks entry the whole time (no open/close step).

  const stream = await tx.stream.findUniqueOrThrow({ where: { id: streamId } });
  const es = await tx.examSubject.findUnique({ where: { examId_classId_subjectId: { examId, classId: stream.classId, subjectId } } });
  if (!es) throw new UserError("This subject is not set up for this class in this examination.");
  if (!args.correction && !(await canEnterMarks(tx, user, streamId, subjectId, exam.term.academicYearId)))
    throw new UserError("You are not allocated to teach this subject in this stream.");

  const sub = await tx.markSubmission.findUnique({ where: { examId_streamId_subjectId: { examId, streamId, subjectId } } });
  if (sub && (sub.status === "SUBMITTED" || sub.status === "APPROVED") && !args.correction && (await marksApprovalRequired()))
    throw new UserError(`Marks are ${sub.status.toLowerCase()} and locked. Ask the DOS to return them for correction.`);
  if (args.correction && !user.permissions.has("marks.approve")) throw new UserError("Only approvers can correct submitted marks.");
  if (args.correction && !args.reason) throw new UserError("Give a reason for the correction.");

  const max = Number(es.maxMarks);
  const errors: string[] = [];
  for (const e of entries) {
    if (e.status === "PRESENT") {
      const err = validateScore(e.score, max);
      if (err) errors.push(err);
    }
  }
  if (errors.length) throw new UserError(`${errors.length} invalid mark(s): ${errors[0]}. Nothing was saved.`);

  // Students must belong to this stream and take the subject this year.
  const allowed = new Set(
    (await tx.student.findMany({ where: { streamId, subjects: { some: { subjectId, academicYearId: exam.term.academicYearId } } }, select: { id: true } })).map((s) => s.id),
  );
  const bad = [...entries.map((e) => e.studentId), ...clear].filter((id) => !allowed.has(id));
  if (bad.length) throw new UserError(`${bad.length} student(s) are not in this stream or do not take this subject.`);

  const existing = new Map((await tx.mark.findMany({ where: { examId, subjectId, studentId: { in: [...entries.map((e) => e.studentId), ...clear] } } })).map((m) => [m.studentId, m]));
  const changes: { studentId: string; from: string; to: string }[] = [];
  const fmt = (m?: { score: unknown; status: string } | null) => (!m ? "—" : m.status === "PRESENT" ? String(Number(m.score)) : m.status);
  for (const e of entries) {
    const old = existing.get(e.studentId);
    const before = fmt(old);
    const after = fmt({ score: e.score, status: e.status });
    if (before === after) continue;
    await tx.mark.upsert({
      where: { examId_studentId_subjectId: { examId, studentId: e.studentId, subjectId } },
      update: { score: e.score, status: e.status, enteredById: user.id },
      create: { examId, studentId: e.studentId, subjectId, score: e.score, status: e.status, enteredById: user.id },
    });
    changes.push({ studentId: e.studentId, from: before, to: after });
  }
  for (const studentId of clear) {
    const old = existing.get(studentId);
    if (!old) continue;
    await tx.mark.delete({ where: { id: old.id } });
    changes.push({ studentId, from: fmt(old), to: "—" });
  }
  if (!sub) await tx.markSubmission.create({ data: { examId, streamId, subjectId, status: "DRAFT" } });
  else if (sub.status === "REJECTED" && !args.correction) await tx.markSubmission.update({ where: { id: sub.id }, data: { status: "DRAFT" } });
  if (changes.length) {
    await tx.auditLog.create({
      data: {
        userId: user.id, action: args.correction ? "MARKS_CORRECTED" : "MARKS_SAVED", entity: "MarkSubmission", entityId: `${examId}:${streamId}:${subjectId}`,
        details: { count: changes.length, reason: args.reason ?? null, changes: changes.slice(0, 200) },
      },
    });
  }
  return changes.length;
}
