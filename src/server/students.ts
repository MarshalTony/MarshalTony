import "server-only";
import type { Tx } from "@/lib/db";
import { UserError } from "./action";
import { nextNumber } from "./counters";

export async function generateAdmissionNo(tx: Tx, year: number) {
  for (;;) {
    const n = await nextNumber(tx, `ADM-${year}`);
    const no = `BOHS/${year}/${String(n).padStart(4, "0")}`;
    if (!(await tx.student.findUnique({ where: { admissionNo: no } }))) return no;
  }
}

/** Default subject enrollment: O-Level compulsory subjects, or the A-Level combination's subjects. */
export async function defaultSubjectIds(tx: Tx, classId: string, combinationId: string | null) {
  const cls = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId } });
  if (cls.level === "A_LEVEL") {
    if (!combinationId) return [];
    const combo = await tx.combinationSubject.findMany({ where: { combinationId } });
    return combo.map((c) => c.subjectId);
  }
  const subs = await tx.subject.findMany({ where: { level: "O_LEVEL", category: "COMPULSORY", isActive: true } });
  return subs.map((s) => s.id);
}

export async function assertStreamInClass(tx: Tx, classId: string, streamId: string) {
  const s = await tx.stream.findUnique({ where: { id: streamId } });
  if (!s || s.classId !== classId) throw new UserError("The stream does not belong to the selected class.");
}

export async function currentYearOrThrow(tx: Tx) {
  const y = await tx.academicYear.findFirst({ where: { isCurrent: true } });
  if (!y) throw new UserError("Set a current academic year in Settings first.");
  return y;
}

