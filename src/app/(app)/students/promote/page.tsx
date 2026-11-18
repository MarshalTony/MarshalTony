import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { promoteStudents } from "@/server/actions/students";
import { PromotionTable } from "@/components/promotion-table";
import { FilterBar } from "@/components/filters";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Promote students" };

export default async function PromotePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("students.manage");
  const params = await searchParams;
  const classId = sp(params, "classId");
  const toYearId = sp(params, "toYearId");
  const [classes, years, current] = await Promise.all([
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  const cls = classes.find((c) => c.id === classId);
  const next = cls ? classes.find((c) => c.order === cls.order + 1) : undefined;
  const nextStreams = next ? await prisma.stream.findMany({ where: { classId: next.id, isActive: true }, orderBy: { name: "asc" } }) : [];
  const students = cls
    ? await prisma.student.findMany({
        where: { classId: cls.id, status: "ACTIVE" }, include: { stream: true, examResults: { orderBy: { computedAt: "desc" }, take: 1 } },
        orderBy: [{ stream: { name: "asc" } }, { lastName: "asc" }],
      })
    : [];
  const futureYears = years.filter((y) => y.id !== current?.id);
  return (
    <>
      <PageHeader title="Promote students" description="Move a class into the next academic year. Previous class records are kept as history." />
      {futureYears.length === 0 && <Alert tone="warn" className="mb-4">Create the next academic year in Settings → Years & terms first.</Alert>}
      <FilterBar filters={[
        { name: "classId", label: "From class", options: classes.map((c) => ({ value: c.id, label: c.name })) },
        { name: "toYearId", label: "Into year", options: futureYears.map((y) => ({ value: y.id, label: y.name })) },
      ]} />
      {cls && toYearId && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {students.length} active students in {cls.name}. {next ? `Promoted students move to ${next.name}.` : `${cls.name} is the final class: use Graduate.`}
          </p>
          <PromotionTable
            action={promoteStudents}
            fromClassId={cls.id}
            toYearId={toYearId}
            defaultDecision={!next || cls.code === "S4" ? "GRADUATE" : "PROMOTE"}
            streams={nextStreams.map((s) => ({ id: s.id, name: s.name }))}
            rows={students.map((s) => ({ id: s.id, name: studentName(s), admissionNo: s.admissionNo, stream: s.stream.name, average: s.examResults[0] ? Number(s.examResults[0].average) : null }))}
          />
        </>
      )}
      {(!cls || !toYearId) && <p className="text-sm text-slate-500">Choose a class and the academic year to promote into.</p>}
    </>
  );
}
