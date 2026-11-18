import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { addAllocation, removeAllocation } from "@/server/actions/academics";
import { ConfirmAction, FormDialog, SelectField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { classTree, streamOptions } from "@/server/queries/lookups";
import Link from "next/link";

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("academics.view");
  const params = await searchParams;
  const manage = can(user, "academics.manage");
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return <Alert tone="warn">Set a current academic year first.</Alert>;
  const [tree, staff, subjects, allocations] = await Promise.all([
    classTree(),
    prisma.staff.findMany({ where: { status: "ACTIVE", isTeaching: true }, orderBy: { lastName: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
    prisma.teacherAllocation.findMany({
      where: { academicYearId: year.id, ...(sp(params, "streamId") ? { streamId: sp(params, "streamId") } : {}), ...(sp(params, "staffId") ? { staffId: sp(params, "staffId") } : {}) },
      include: { staff: true, subject: true, stream: { include: { schoolClass: true } } },
      orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { stream: { name: "asc" } }, { subject: { name: "asc" } }],
    }),
  ]);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Allocations for {year.name}. Subject teachers can only enter marks for their allocated subjects and streams.</p>
        {manage && (
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href="/imports?kind=allocations">Import from Excel</Link></Button>
            <FormDialog trigger="Allocate teacher" title="Allocate a teacher" action={addAllocation} wide>
              <SelectField label="Teacher" name="staffId" required placeholder="Select" options={staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName} (${s.staffNo})` }))} />
              <SelectField label="Subject" name="subjectId" required placeholder="Select" options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.level === "O_LEVEL" ? "O" : "A"}-Level)` }))} />
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Streams</legend>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                  {tree.flatMap((c) => c.streams.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="streamIds[]" value={s.id} />{c.code} {s.name}</label>
                  )))}
                </div>
              </fieldset>
            </FormDialog>
          </div>
        )}
      </div>
      <FilterBar filters={[
        { name: "streamId", label: "Stream", options: streamOptions(tree) },
        { name: "staffId", label: "Teacher", options: staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName}` })) },
      ]} />
      <Table>
        <THead><tr><TH>Stream</TH><TH>Subject</TH><TH>Teacher</TH><TH /></tr></THead>
        <tbody>
          {allocations.map((a) => (
            <TR key={a.id}>
              <TD>{a.stream.schoolClass.code} {a.stream.name}</TD>
              <TD>{a.subject.name}</TD>
              <TD>{a.staff.lastName} {a.staff.firstName}</TD>
              <TD className="text-right">{manage && <ConfirmAction action={removeAllocation} fields={{ id: a.id }} label="Remove" confirm="Remove this allocation?" />}</TD>
            </TR>
          ))}
          {allocations.length === 0 && <TR><TD colSpan={4} className="text-slate-500">No allocations yet.</TD></TR>}
        </tbody>
      </Table>
    </>
  );
}
