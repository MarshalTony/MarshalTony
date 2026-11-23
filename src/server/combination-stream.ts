import "server-only";
import type { Tx } from "@/lib/db";
import { pickStream } from "@/lib/combination-stream";
import { audit } from "./audit";

/** The stream an A-Level student with this combination belongs in (null = no rule applies: O-Level, no category, or no matching stream). */
export async function streamForCombination(tx: Tx, classId: string, combinationId: string | null | undefined, currentStreamId?: string | null) {
  if (!combinationId) return null;
  const [cls, combo] = await Promise.all([
    tx.schoolClass.findUnique({ where: { id: classId }, select: { level: true, streams: { select: { id: true, name: true, isActive: true, combinationCategory: true } } } }),
    tx.subjectCombination.findUnique({ where: { id: combinationId }, select: { category: true } }),
  ]);
  if (!cls || cls.level !== "A_LEVEL" || !combo?.category) return null;
  return pickStream(cls.streams, combo.category, currentStreamId);
}

/** Move a student to another stream of their class, keeping this year's enrolment in step (like Transfer stream). Returns true if moved. */
export async function moveToStream(tx: Tx, args: { studentId: string; fromStreamId: string; toStreamId: string | null; classId: string; academicYearId: string; userId: string; reason: string }) {
  if (!args.toStreamId || args.toStreamId === args.fromStreamId) return false;
  await tx.student.update({ where: { id: args.studentId }, data: { streamId: args.toStreamId } });
  await tx.enrollment.upsert({
    where: { studentId_academicYearId: { studentId: args.studentId, academicYearId: args.academicYearId } },
    update: { streamId: args.toStreamId },
    create: { studentId: args.studentId, academicYearId: args.academicYearId, classId: args.classId, streamId: args.toStreamId },
  });
  await audit(args.userId, "TRANSFER_STREAM", "Student", args.studentId, { from: args.fromStreamId, to: args.toStreamId, reason: args.reason }, tx);
  return true;
}
