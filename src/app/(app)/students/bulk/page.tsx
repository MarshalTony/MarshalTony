import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { bulkUpdateStudents } from "@/server/actions/students";
import { BulkStudentGrid } from "@/components/bulk-student-grid";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";

export const metadata = { title: "Bulk edit students" };

export default async function BulkStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("students.manage");
  const q = await searchParams;
  const [year, classes] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } }),
  ]);
  const cls = classes.find((c) => c.id === sp(q, "classId"));
  const streamFilter = cls?.streams.find((s) => s.id === sp(q, "streamId"));

  const header = (
    <PageHeader
      title="Bulk edit students"
      description="Change several students at once: names, sex, stream, day/boarding, LIN, SchoolPay code, house and elective subjects. Changed rows turn yellow; nothing is saved until you press Save."
      actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
    />
  );
  const picker = (
    <ScorePicker fields={[
      { name: "classId", label: "Class", placeholder: "Select class", value: cls?.id, resets: ["streamId"], options: classes.map((c) => ({ value: c.id, label: c.name })) },
      { name: "streamId", label: "Stream (optional)", placeholder: "All streams", value: streamFilter?.id, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
    ]} />
  );
  if (!year) return <>{header}<Alert tone="warn">Set the current academic year first (Settings → Years & terms).</Alert></>;
  if (!cls) return <>{header}{picker}<Alert>Select a class to edit its students.</Alert></>;

  const [students, electives, combos, houses] = await Promise.all([
    prisma.student.findMany({
      where: { classId: cls.id, status: "ACTIVE", ...(streamFilter ? { streamId: streamFilter.id } : {}) },
      include: { subjects: { where: { academicYearId: year.id }, select: { subjectId: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.subject.findMany({ where: { level: cls.level, isActive: true, category: { not: "COMPULSORY" } }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    cls.level === "A_LEVEL" ? prisma.subjectCombination.findMany({ where: { isActive: true }, include: { subjects: true }, orderBy: { code: "asc" } }) : Promise.resolve(null),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const electiveIds = new Set(electives.map((e) => e.id));

  return (
    <>
      {header}
      {picker}
      <p className="mb-2 text-xs text-slate-500">
        Subjects are for {year.name}. Compulsory subjects are not shown and are not changed. A stream change also moves the student&apos;s {year.name} enrolment (as <i>Transfer stream</i>). Changing day/boarding does not change invoices already issued.
        {cls.level === "A_LEVEL" && " Choosing a combination ticks its subjects."}
      </p>
      {students.length === 0 ? <Alert>No active students in {cls.name}{streamFilter ? ` ${streamFilter.name}` : ""}.</Alert> : (
        <BulkStudentGrid
          action={bulkUpdateStudents}
          classId={cls.id}
          streams={cls.streams.map((s) => ({ value: s.id, label: s.name }))}
          electives={electives.map((e) => ({ id: e.id, label: e.shortName || e.code, title: `${e.name}${e.category !== "ELECTIVE" ? ` (${e.category.toLowerCase()})` : ""}` }))}
          houses={houses.map((h) => ({ value: h.id, label: h.name }))}
          combinations={combos ? combos.map((c) => ({ value: c.id, label: c.code, subjectIds: c.subjects.map((x) => x.subjectId) })) : null}
          rows={students.map((s) => ({
            id: s.id, admissionNo: s.admissionNo, lastName: s.lastName, firstName: s.firstName, otherNames: s.otherNames ?? "",
            gender: s.gender, streamId: s.streamId, residence: s.residence, linNumber: s.linNumber ?? "", schoolPayCode: s.schoolPayCode ?? "",
            combinationId: s.combinationId ?? "", houseId: s.houseId ?? "", electives: s.subjects.map((x) => x.subjectId).filter((id) => electiveIds.has(id)),
          }))}
        />
      )}
    </>
  );
}
