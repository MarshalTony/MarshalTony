import "server-only";
import type { Tx } from "@/lib/db";
import { effectiveStatus, type SubjectStatus } from "@/lib/class-subjects";

/** subjectId → status in this class, for the active subjects of the class's level (O-Level: per-class rules; A-Level: by category). */
export async function classSubjectStatus(tx: Tx, classId: string): Promise<{ level: string; status: Map<string, SubjectStatus> }> {
  const cls = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId }, select: { level: true, subjectRules: { select: { subjectId: true, status: true } } } });
  const subjects = await tx.subject.findMany({ where: { level: cls.level, isActive: true }, select: { id: true, category: true } });
  const rule = new Map(cls.subjectRules.map((r) => [r.subjectId, r.status as SubjectStatus]));
  return { level: cls.level, status: new Map(subjects.map((s) => [s.id, cls.level === "O_LEVEL" ? effectiveStatus(s.category, rule.get(s.id)) : "OPTIONAL"])) };
}
