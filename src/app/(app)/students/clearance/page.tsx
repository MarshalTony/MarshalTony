import Link from "next/link";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { clearanceFor, officesUserMayClear, OFFICES } from "@/server/leaving";
import { clearOffice } from "@/server/actions/leaving";
import { ConfirmAction } from "@/components/forms";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Leaving clearance" };

/** Class clearance board: every student of a class with each office's status. Offices clear in one click where nothing is outstanding. */
export default async function ClearanceBoard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const q = await searchParams;
  const classes = await prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } });
  const cls = classes.find((c) => c.id === sp(q, "classId"));
  const stream = cls?.streams.find((s) => s.id === sp(q, "streamId"));

  const header = (
    <PageHeader
      title="Leaving clearance"
      description="Clear leavers office by office (fees, library, stores, discipline, class teacher). Ticks clear in one click when the system sees nothing outstanding; otherwise open the student to add a note."
      actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
    />
  );
  const picker = (
    <ScorePicker fields={[
      { name: "classId", label: "Class", placeholder: "Select class", value: cls?.id, resets: ["streamId"], options: classes.map((c) => ({ value: c.id, label: c.name })) },
      { name: "streamId", label: "Stream (optional)", placeholder: "All streams", value: stream?.id, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
    ]} />
  );
  if (!cls) return <>{header}{picker}<Alert>Select a class — for example Senior 4 or Senior 6 at the end of the year.</Alert></>;

  const students = await prisma.student.findMany({
    where: { classId: cls.id, ...(stream ? { streamId: stream.id } : {}), OR: [{ status: "ACTIVE" }, { leavingRecord: { isNot: null } }] },
    include: { stream: true, leavingRecord: true },
    orderBy: [{ stream: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });
  const rows = await clearanceFor(students.map((s) => s.id));
  // Offices are the same for every student of a stream; work them out once per stream.
  const mayByStream = new Map<string, Awaited<ReturnType<typeof officesUserMayClear>>>();
  for (const s of students) if (!mayByStream.has(s.streamId)) mayByStream.set(s.streamId, await officesUserMayClear(user, s));
  const fully = students.filter((s) => rows.get(s.id)!.every((r) => r.cleared)).length;

  return (
    <>
      {header}
      {picker}
      <p className="mb-2 text-sm text-slate-600">{students.length} students · <b>{fully}</b> fully cleared · {students.filter((s) => s.leavingRecord).length} leaving records issued</p>
      <Table>
        <THead>
          <tr>
            <TH>Student</TH>
            {OFFICES.map((o) => <TH key={o.code} className="text-center">{o.label.replace(/ \(.*\)/, "")}</TH>)}
            <TH>Leaving</TH>
          </tr>
        </THead>
        <tbody>
          {students.map((s) => {
            const may = mayByStream.get(s.streamId)!;
            return (
              <TR key={s.id}>
                <TD><Link href={`/students/${s.id}/leaving`} className="font-medium text-brand-800 hover:underline">{studentName(s)}</Link><span className="block font-mono text-[11px] text-slate-500">{s.admissionNo} · {cls.code} {s.stream.name}</span></TD>
                {rows.get(s.id)!.map((r) => (
                  <TD key={r.office} className="text-center">
                    {r.cleared ? <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" aria-label={`Cleared by ${r.cleared.by}`} />
                      : r.check.issue ? <Link href={`/students/${s.id}/leaving`} title={r.check.issue} className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"><AlertTriangle className="h-4 w-4" />{r.office === "BURSAR" ? r.check.issue.replace("Owes ", "") : "Issue"}</Link>
                      : may.has(r.office) ? <ConfirmAction action={clearOffice} fields={{ studentId: s.id, office: r.office }} label="Clear" ariaLabel={`Clear ${r.label} for ${studentName(s)}`} />
                      : <span className="text-xs text-slate-400">pending</span>}
                  </TD>
                ))}
                <TD>{s.leavingRecord ? <span className="text-xs"><StatusBadge status={s.status} /><span className="block font-mono text-slate-500">{s.leavingRecord.certificateNo}</span></span> : <Link href={`/students/${s.id}/leaving`} className="text-xs text-brand-700 hover:underline">Record…</Link>}</TD>
              </TR>
            );
          })}
          {students.length === 0 && <TR><TD colSpan={OFFICES.length + 2} className="py-6 text-center text-slate-500">No students in this class.</TD></TR>}
        </tbody>
      </Table>
    </>
  );
}
