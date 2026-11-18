import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { saveAcademicYear, saveTerm, setCurrentTerm } from "@/server/actions/settings";
import { ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate } from "@/lib/utils";

export default async function AcademicSettings() {
  await requirePage("settings.manage");
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" }, include: { terms: { orderBy: { number: "asc" } } } });
  const yearOpts = years.map((y) => ({ value: y.id, label: y.name }));
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <FormDialog trigger="New academic year" title="New academic year" action={saveAcademicYear}>
          <TextField label="Name" name="name" placeholder="2027" required />
          <Grid><TextField label="Start date" name="startDate" type="date" required /><TextField label="End date" name="endDate" type="date" required /></Grid>
        </FormDialog>
        <FormDialog trigger="New term" title="New term" action={saveTerm} triggerVariant="secondary">
          <TermFields yearOpts={yearOpts} />
        </FormDialog>
      </div>
      {years.map((y) => (
        <Card key={y.id}>
          <CardHeader>
            <CardTitle>{y.name} {y.isCurrent && <Badge color="green" className="ml-2">Current</Badge>}</CardTitle>
            <FormDialog trigger="Edit year" title={`Edit ${y.name}`} action={saveAcademicYear} triggerVariant="outline" triggerSize="sm">
              <input type="hidden" name="id" value={y.id} />
              <TextField label="Name" name="name" defaultValue={y.name} required />
              <Grid><TextField label="Start date" name="startDate" type="date" defaultValue={isoDate(y.startDate)} required /><TextField label="End date" name="endDate" type="date" defaultValue={isoDate(y.endDate)} required /></Grid>
            </FormDialog>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Term</TH><TH>Opens</TH><TH>Closes</TH><TH>Next term begins</TH><TH /></tr></THead>
              <tbody>
                {y.terms.map((t) => (
                  <TR key={t.id}>
                    <TD>{t.name} {t.isCurrent && <Badge color="green">Current</Badge>}</TD>
                    <TD>{fmtDate(t.startDate)}</TD>
                    <TD>{fmtDate(t.endDate)}</TD>
                    <TD>{fmtDate(t.nextTermStart)}</TD>
                    <TD className="flex justify-end gap-2">
                      {!t.isCurrent && <ConfirmAction action={setCurrentTerm} fields={{ id: t.id }} label="Make current" confirm={`Make ${y.name} ${t.name} the current term?`} />}
                      <FormDialog trigger="Edit" title={`Edit ${t.name}`} action={saveTerm} triggerVariant="outline" triggerSize="sm">
                        <input type="hidden" name="id" value={t.id} />
                        <TermFields yearOpts={yearOpts} t={t} />
                      </FormDialog>
                    </TD>
                  </TR>
                ))}
                {y.terms.length === 0 && <TR><TD colSpan={5}>No terms yet.</TD></TR>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TermFields({ yearOpts, t }: { yearOpts: { value: string; label: string }[]; t?: { academicYearId: string; number: number; name: string; startDate: Date; endDate: Date; nextTermStart: Date | null } }) {
  return (
    <>
      <Grid>
        <SelectField label="Academic year" name="academicYearId" options={yearOpts} defaultValue={t?.academicYearId} required />
        <SelectField label="Term number" name="number" options={[1, 2, 3].map((n) => ({ value: String(n), label: `Term ${n}` }))} defaultValue={String(t?.number ?? 1)} required />
      </Grid>
      <TextField label="Name" name="name" defaultValue={t?.name ?? ""} placeholder="Term 1" required />
      <Grid>
        <TextField label="Opening date" name="startDate" type="date" defaultValue={isoDate(t?.startDate)} required />
        <TextField label="Closing date" name="endDate" type="date" defaultValue={isoDate(t?.endDate)} required />
      </Grid>
      <TextField label="Next term begins (shown on report cards)" name="nextTermStart" type="date" defaultValue={isoDate(t?.nextTermStart)} />
    </>
  );
}
