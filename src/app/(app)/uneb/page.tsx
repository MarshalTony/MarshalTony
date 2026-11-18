import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { registerCandidates, updateCandidate, updatePractical } from "@/server/actions/ops";
import { CheckboxField, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { isoDate, studentName } from "@/lib/utils";

export const metadata = { title: "UNEB candidates" };

export default async function UnebPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("uneb.manage");
  const params = await searchParams;
  const level = sp(params, "level") ?? "UCE";
  const year = Number(sp(params, "year") ?? new Date().getFullYear());
  const candidates = await prisma.unebCandidate.findMany({
    where: { examLevel: level, year }, include: { student: { include: { stream: true } }, subjects: { include: { subject: true }, orderBy: { subject: { name: "asc" } } } },
    orderBy: { student: { lastName: "asc" } },
  });
  const q = `level=${level}&year=${year}`;
  return (
    <>
      <PageHeader title="UNEB candidates" description="School-side candidate registers for UCE (S4) and UACE (S6). This is not an official UNEB integration — registration itself is done on the UNEB portal; keep these records in step." actions={
        <>
          {["pdf", "xlsx"].map((f) => <Button key={f} asChild variant="outline"><a href={`/api/reports/uneb?${q}&format=${f}`} target="_blank"><Download />Candidate list {f.toUpperCase()}</a></Button>)}
          <FormDialog trigger="Create candidate records" title="Create candidate records" action={registerCandidates}>
            <Grid><SelectField label="Examination" name="examLevel" defaultValue={level} options={[{ value: "UCE", label: "UCE (S4)" }, { value: "UACE", label: "UACE (S6)" }]} /><TextField label="Year" name="year" type="number" defaultValue={String(year)} required /></Grid>
            <p className="text-sm text-slate-600">Creates a record for every active student in the class with their current subjects. Existing records are kept.</p>
          </FormDialog>
        </>
      } />
      <FilterBar filters={[
        { name: "level", label: "Exam", allowAll: false, value: level, options: [{ value: "UCE", label: "UCE" }, { value: "UACE", label: "UACE" }] },
        { name: "year", label: "Year", allowAll: false, value: String(year), options: [year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) })) },
      ]} />
      {candidates.length === 0 ? <Alert>No {level} candidate records for {year}.</Alert> : (
        <Table>
          <THead><tr><TH>Candidate</TH><TH>Index no.</TH><TH>Subjects & practicals</TH><TH>Fees</TH><TH>Status</TH><TH /></tr></THead>
          <tbody>
            {candidates.map((c) => (
              <TR key={c.id}>
                <TD>{studentName(c.student)}<p className="text-xs text-slate-500">{c.student.admissionNo} · stream {c.student.stream.name}</p></TD>
                <TD className="font-mono text-xs">{c.candidateNo ?? "—"}<br /><span className="text-slate-400">centre {c.centreNo ?? "—"}</span></TD>
                <TD className="text-xs">
                  {c.subjects.map((e) => (
                    <span key={e.id} className="mr-2 inline-flex items-center gap-1">
                      {e.subject.shortName ?? e.subject.code}
                      {e.subject.hasPractical && (
                        <FormDialog trigger={e.practicalDone ? "✓ practical" : "practical"} title={`${e.subject.name} — practical`} action={updatePractical} triggerVariant="link" triggerSize="sm">
                          <input type="hidden" name="entryId" value={e.id} />
                          <Grid><TextField label="Practical date" name="practicalDate" type="date" defaultValue={isoDate(e.practicalDate)} /><TextField label="Paper codes" name="paperCodes" defaultValue={e.paperCodes ?? ""} /></Grid>
                          <CheckboxField name="practicalDone" label="Practical done" defaultChecked={e.practicalDone} />
                          <TextField label="Notes" name="practicalNotes" defaultValue={e.practicalNotes ?? ""} />
                        </FormDialog>
                      )}
                    </span>
                  ))}
                </TD>
                <TD>{c.feesPaid ? <StatusBadge status="PAID" /> : <StatusBadge status="PENDING" />}</TD>
                <TD><StatusBadge status={c.status} /></TD>
                <TD>
                  <FormDialog trigger="Edit" title="Candidate" action={updateCandidate} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="id" value={c.id} />
                    <TextField label="UNEB index / candidate no." name="candidateNo" defaultValue={c.candidateNo ?? ""} />
                    <SelectField label="Status" name="status" defaultValue={c.status} options={["DRAFT", "REGISTERED", "WITHDRAWN"].map((s) => ({ value: s, label: s }))} />
                    <CheckboxField name="feesPaid" label="UNEB registration fee paid" defaultChecked={c.feesPaid} />
                    <TextField label="Notes" name="notes" defaultValue={c.notes ?? ""} />
                  </FormDialog>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
