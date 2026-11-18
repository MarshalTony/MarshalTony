import "server-only";
import { prisma } from "@/lib/db";

export type ResultsReadiness = {
  generatedAt: Date | null;
  /** Marks were saved after results were last generated. */
  stale: boolean;
  lastMarkAt: Date | null;
  /** Last generation included unapproved marks. */
  provisional: boolean;
  /** Mark sheets with marks that are not approved (left out of results unless generated provisionally). */
  pending: { stream: string; subject: string; status: string }[];
};

/** Why an exam's results (and so its report cards) may not show the marks teachers have entered. */
export async function resultsReadiness(examId: string): Promise<ResultsReadiness> {
  const [exam, last, lastGen, subs] = await Promise.all([
    prisma.exam.findUniqueOrThrow({ where: { id: examId }, select: { resultsGeneratedAt: true, isComposite: true } }),
    prisma.mark.aggregate({ where: { examId }, _max: { updatedAt: true } }),
    prisma.auditLog.findFirst({ where: { entity: "Exam", entityId: examId, action: "GENERATE_RESULTS" }, orderBy: { createdAt: "desc" }, select: { details: true } }),
    prisma.markSubmission.findMany({
      where: { examId, status: { not: "APPROVED" } },
      include: { stream: { include: { schoolClass: true } }, subject: true },
      orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { stream: { name: "asc" } }, { subject: { name: "asc" } }],
    }),
  ]);
  const lastMarkAt = last._max.updatedAt ?? null;
  const provisional = !!(lastGen?.details as { includeUnapproved?: boolean } | null)?.includeUnapproved;
  return {
    generatedAt: exam.resultsGeneratedAt,
    lastMarkAt,
    stale: !exam.isComposite && !!lastMarkAt && (!exam.resultsGeneratedAt || lastMarkAt > exam.resultsGeneratedAt),
    provisional,
    pending: subs.map((s) => ({ stream: `${s.stream.schoolClass.code} ${s.stream.name}`, subject: s.subject.name, status: s.status })),
  };
}
