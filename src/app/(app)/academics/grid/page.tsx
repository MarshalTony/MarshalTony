import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveAllocationGrid, copyAllocations } from "@/server/actions/academics";
import { AllocationGrid } from "@/components/allocation-grid";
import { ConfirmAction } from "@/components/forms";
import { ScorePicker } from "@/components/score-picker";
import { Alert } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";

const GROUP: Record<string, string> = { COMPULSORY: "Compulsory subjects", ELECTIVE: "Electives", PRINCIPAL: "Principal subjects", SUBSIDIARY: "Subsidiary subjects" };
const ORDER = ["COMPULSORY", "PRINCIPAL", "ELECTIVE", "SUBSIDIARY"];

/** Allocation grid: one class × one year — subjects down, streams across, a teacher in each cell, plus class teachers. */
export default async function AllocationGridPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("academics.view");
  const q = await searchParams;
  const manage = can(user, "academics.manage");
  const [classes, years] = await Promise.all([
    prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
  ]);
  const cls = classes.find((c) => c.id === sp(q, "classId")) ?? classes[0];
  const year = years.find((y) => y.id === sp(q, "yearId")) ?? years.find((y) => y.isCurrent) ?? years[0];
  const picker = (
    <ScorePicker fields={[
      { name: "classId", label: "Class", placeholder: "Select class", value: cls?.id, options: classes.map((c) => ({ value: c.id, label: c.name })) },
      { name: "yearId", label: "Year", placeholder: "Select year", value: year?.id, options: years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` })) },
    ]} />
  );
  if (!cls || !year) return <>{picker}<Alert tone="warn">Set up classes and the academic year first (Settings).</Alert></>;
  if (!cls.streams.length) return <>{picker}<Alert tone="warn">{cls.name} has no active streams (Settings → Classes & streams).</Alert></>;

  const streamIds = cls.streams.map((s) => s.id);
  const [subjects, allocs, staff, load] = await Promise.all([
    prisma.subject.findMany({ where: { level: cls.level, isActive: true }, orderBy: { name: "asc" } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: year.id, streamId: { in: streamIds } }, include: { staff: true } }),
    prisma.staff.findMany({ where: { OR: [{ status: "ACTIVE", isTeaching: true }, { classTeacherOf: { some: { id: { in: streamIds } } } }] }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.teacherAllocation.groupBy({ by: ["staffId"], where: { academicYearId: year.id }, _count: true }),
  ]);
  const prev = years.find((y) => y.startDate < year.startDate);
  const loadBy = new Map(load.map((l) => [l.staffId, l._count]));
  // Staff allocated here but no longer active/teaching stay selectable so nothing is lost silently.
  const extra = allocs.map((a) => a.staff).filter((s) => !staff.some((x) => x.id === s.id));
  const teachers = [...staff, ...extra].map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName}${loadBy.get(s.id) ? ` (${loadBy.get(s.id)})` : ""}${s.status !== "ACTIVE" ? " — left" : ""}` }));

  const initial: Record<string, string> = {};
  const multiNames: Record<string, string> = {};
  for (const sub of subjects) for (const st of cls.streams) {
    const here = allocs.filter((a) => a.subjectId === sub.id && a.streamId === st.id);
    const k = `${sub.id}:${st.id}`;
    initial[k] = here.length === 0 ? "" : here.length === 1 ? here[0].staffId : "*";
    if (here.length > 1) multiNames[k] = here.map((a) => `${a.staff.lastName} ${a.staff.firstName}`).join(" + ");
  }
  const sorted = [...subjects].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name));

  return (
    <>
      {picker}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {cls.name}, {year.name}: choose the teacher for each subject in each stream. The number after a name is how many subjects × streams they already teach this year. Changed cells turn yellow; nothing is saved until you press Save.
        </p>
        {manage && prev && (
          <ConfirmAction action={copyAllocations} fields={{ classId: cls.id, fromYearId: prev.id, toYearId: year.id }} label={`Copy from ${prev.name}`} confirm={`Copy ${cls.name}'s ${prev.name} allocations into the empty cells for ${year.name}? Cells that already have a teacher are not changed.`} />
        )}
      </div>
      {!manage ? <Alert className="mb-3">You can view allocations; only the system administrator or DOS can change them.</Alert> : null}
      <AllocationGrid
        action={saveAllocationGrid}
        classId={cls.id}
        academicYearId={year.id}
        subjects={sorted.map((s) => ({ id: s.id, name: s.name, group: GROUP[s.category] ?? s.category }))}
        streams={cls.streams.map((s) => ({ id: s.id, name: s.name }))}
        teachers={teachers}
        initial={initial}
        initialClassTeachers={Object.fromEntries(cls.streams.map((s) => [s.id, s.classTeacherId ?? ""]))}
        multiNames={multiNames}
        readOnly={!manage}
      />
    </>
  );
}
