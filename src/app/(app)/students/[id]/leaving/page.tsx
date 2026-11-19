import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, AlertTriangle, Clock, FileText, Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { clearanceFor, officesUserMayClear, LEAVING_REASONS, CONDUCT } from "@/server/leaving";
import { clearOffice, unclearOffice, saveLeaving } from "@/server/actions/leaving";
import { ActionForm, CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, fmtDateTime, isoDate, studentName } from "@/lib/utils";

export const metadata = { title: "Leaving & clearance" };

export default async function LeavingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("students.view");
  const { id } = await params;
  const s = await prisma.student.findUnique({ where: { id }, include: { schoolClass: true, stream: true, leavingRecord: true } });
  if (!s) notFound();
  const [rows, mayClear] = await Promise.all([clearanceFor([s.id]).then((m) => m.get(s.id)!), officesUserMayClear(user, s)]);
  const done = rows.filter((r) => r.cleared).length;
  const pending = rows.length - done;
  const manage = can(user, "students.manage");
  const rec = s.leavingRecord;
  const pdf = (doc: string) => `/api/pdf/leaving/${s.id}?doc=${doc}`;

  return (
    <>
      <PageHeader
        title={`Leaving & clearance — ${studentName(s)}`}
        description={`${s.admissionNo} · ${s.schoolClass.name} ${s.stream.name} · admitted ${fmtDate(s.admissionDate)}`}
        actions={<><StatusBadge status={s.status} /><Button asChild variant="outline"><Link href={`/students/${s.id}`}>Back to profile</Link></Button></>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Clearance ({done} of {rows.length} offices)</CardTitle>
              <Button asChild size="sm" variant="outline"><a href={pdf("clearance")} target="_blank"><Printer />Clearance form</a></Button>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Office</TH><TH>System check</TH><TH>Signed</TH><TH /></tr></THead>
                <tbody>
                  {rows.map((r) => (
                    <TR key={r.office}>
                      <TD className="font-medium">{r.label}</TD>
                      <TD>{r.check.issue
                        ? <span className="flex items-start gap-1 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{r.check.issue}</span>
                        : <span className="text-slate-600">{r.check.info}</span>}</TD>
                      <TD>{r.cleared
                        ? <span className="flex items-start gap-1 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{r.cleared.by}<span className="block text-xs text-slate-500">{fmtDateTime(r.cleared.at)}{r.cleared.note ? ` — ${r.cleared.note}` : ""}</span></span></span>
                        : <span className="flex items-center gap-1 text-amber-700"><Clock className="h-4 w-4" />Pending</span>}</TD>
                      <TD className="text-right">
                        {mayClear.has(r.office) && (r.cleared
                          ? <ConfirmAction action={unclearOffice} fields={{ studentId: s.id, office: r.office }} label="Undo" variant="ghost" confirm={`Remove the ${r.label} clearance?`} />
                          : (
                            <FormDialog trigger="Clear" title={`Clear — ${r.label}`} action={clearOffice} triggerSize="sm" triggerVariant={r.check.issue ? "outline" : "default"}>
                              <input type="hidden" name="studentId" value={s.id} />
                              <input type="hidden" name="office" value={r.office} />
                              {r.check.issue && <Alert tone="warn">{r.check.issue}. A note is required to clear anyway.</Alert>}
                              <TextField label={r.check.issue ? "Note (required)" : "Note (optional)"} name="note" required={!!r.check.issue} placeholder={r.office === "BURSAR" ? "e.g. balance waived / parent to pay by …" : ""} />
                            </FormDialog>
                          ))}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <p className="mt-2 text-xs text-slate-500">Each office signs its own line (bursar, librarian, store keeper, discipline, class teacher); administrators can sign any. Every sign-off is in the audit log.</p>
            </CardContent>
          </Card>

          {manage && (
            <Card>
              <CardHeader><CardTitle>{rec ? `Leaving record — ${rec.certificateNo}` : "Record leaving"}</CardTitle></CardHeader>
              <CardContent>
                {pending > 0 && <Alert tone="warn" className="mb-3">{pending} office(s) have not cleared this student yet.</Alert>}
                <ActionForm action={saveLeaving} submitLabel={rec ? "Update leaving record" : "Record leaving & issue certificate number"}>
                  <input type="hidden" name="studentId" value={s.id} />
                  <Grid>
                    <TextField label="Date of leaving" name="leavingDate" type="date" required defaultValue={isoDate(rec?.leavingDate ?? s.exitDate ?? new Date())} />
                    <SelectField label="Reason" name="reason" required defaultValue={rec?.reason ?? (["S4", "S6"].includes(s.schoolClass.code) ? "COMPLETED" : "TRANSFERRED")} options={LEAVING_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
                    <SelectField label="Conduct" name="conduct" required defaultValue={rec?.conduct ?? "Good"} options={CONDUCT.map((c) => ({ value: c, label: c }))} />
                    <TextField label="Next school (for transfers)" name="destinationSchool" defaultValue={rec?.destinationSchool ?? ""} />
                  </Grid>
                  <TextAreaField label="Remarks for the certificate" name="remarks" rows={3} defaultValue={rec?.remarks ?? ""} hint="e.g. leadership roles, clubs, sports, character." />
                  {pending > 0 && <CheckboxField name="override" label="Issue anyway, although clearance is not complete" />}
                  <p className="text-xs text-slate-500">Saving sets the student&apos;s status (Graduated / Transferred / Withdrawn / Expelled), closes this year&apos;s enrolment and disables their portal login. The certificate number is issued once and kept if you update the record.</p>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              ["clearance", "Clearance form", true, "Checklist with the offices' sign-offs"],
              ["certificate", "Leaving certificate / testimonial", !!rec, "Classes attended, conduct and remarks"],
              ["transfer", "Transfer letter", !!rec, "For the receiving school"],
              ["recommendation", "Recommendation letter", true, "For scholarships, jobs or further studies"],
            ].map(([doc, label, ok, hint]) => (
              <div key={doc as string} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2">
                <span className="text-sm"><span className="font-medium">{label}</span><span className="block text-xs text-slate-500">{ok ? hint : "Record the leaving first"}</span></span>
                {ok ? <Button asChild size="sm" variant="outline"><a href={pdf(doc as string)} target="_blank"><FileText />PDF</a></Button> : <Button size="sm" variant="outline" disabled><FileText />PDF</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
