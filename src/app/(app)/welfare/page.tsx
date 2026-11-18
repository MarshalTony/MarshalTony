import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { resolveIncident, saveCounselling, saveIncident, saveMedical } from "@/server/actions/ops";
import { CheckboxField, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate, studentName } from "@/lib/utils";

export const metadata = { title: "Discipline & welfare" };

export default async function WelfarePage() {
  const user = await requirePage("discipline.manage", "welfare.confidential");
  const disc = can(user, "discipline.manage");
  const conf = can(user, "welfare.confidential");
  const [incidents, counselling, medical] = await Promise.all([
    disc || conf ? prisma.disciplineIncident.findMany({ include: { student: { include: { schoolClass: true } } }, orderBy: { date: "desc" }, take: 50 }) : [],
    conf ? prisma.counsellingRecord.findMany({ include: { student: true }, orderBy: { date: "desc" }, take: 30 }) : [],
    conf ? prisma.medicalIncident.findMany({ include: { student: { include: { schoolClass: true } } }, orderBy: { date: "desc" }, take: 30 }) : [],
  ]);
  const today = isoDate(new Date());
  return (
    <>
      <PageHeader title="Discipline & welfare" description="Confidential. Counselling and medical records are visible only to authorised welfare staff and every entry is audited." actions={
        <>
          {disc && (
            <FormDialog trigger="Record incident" title="Disciplinary incident" action={saveIncident} wide>
              <Grid cols={3}>
                <TextField label="Admission no." name="admissionNo" required />
                <TextField label="Date" name="date" type="date" defaultValue={today} required />
                <SelectField label="Severity" name="severity" options={["MINOR", "MODERATE", "MAJOR"].map((s) => ({ value: s, label: s }))} />
              </Grid>
              <TextField label="Category" name="category" required placeholder="Lateness, fighting, absconding, phone possession…" />
              <TextAreaField label="What happened" name="description" rows={3} required />
              <TextAreaField label="Action taken" name="actionTaken" rows={2} />
              <CheckboxField name="parentNotified" label="Parent / guardian informed" />
            </FormDialog>
          )}
          {conf && (
            <>
              <FormDialog trigger="Counselling session" title="Counselling record (confidential)" action={saveCounselling} triggerVariant="secondary" wide>
                <Grid><TextField label="Admission no." name="admissionNo" required /><TextField label="Date" name="date" type="date" defaultValue={today} required /></Grid>
                <TextField label="Concern" name="concern" required />
                <TextAreaField label="Notes" name="notes" rows={4} required />
                <TextField label="Follow-up" name="followUp" />
              </FormDialog>
              <FormDialog trigger="Sick bay visit" title="Medical incident" action={saveMedical} triggerVariant="secondary" wide>
                <Grid><TextField label="Admission no." name="admissionNo" required /><TextField label="Date" name="date" type="date" defaultValue={today} required /></Grid>
                <TextField label="Complaint" name="complaint" required />
                <TextAreaField label="Treatment given" name="treatment" rows={2} />
                <TextField label="Referred to" name="referredTo" placeholder="Hospital / clinic" />
                <CheckboxField name="parentNotified" label="Parent / guardian informed" />
              </FormDialog>
            </>
          )}
        </>
      } />
      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle>Disciplinary incidents</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Date</TH><TH>Student</TH><TH>Category</TH><TH>Details</TH><TH>Status</TH><TH /></tr></THead>
              <tbody>
                {incidents.map((i) => (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap text-xs">{fmtDate(i.date)}</TD>
                    <TD><Link href={`/students/${i.studentId}`} className="hover:underline">{studentName(i.student)}</Link><p className="text-xs text-slate-500">{i.student.schoolClass.code}</p></TD>
                    <TD className="text-xs">{i.category}<br /><StatusBadge status={i.severity === "MAJOR" ? "REJECTED" : i.severity === "MODERATE" ? "PENDING" : "DRAFT"} /></TD>
                    <TD className="text-xs">{i.description}{i.actionTaken && <p className="text-slate-500">Action: {i.actionTaken}</p>}{i.parentNotified && <p className="text-emerald-700">Parent informed</p>}</TD>
                    <TD><StatusBadge status={i.status} /></TD>
                    <TD>{disc && i.status === "OPEN" && (
                      <FormDialog trigger="Resolve" title="Resolve incident" action={resolveIncident} triggerSize="sm" triggerVariant="outline">
                        <input type="hidden" name="id" value={i.id} /><TextAreaField label="Final action taken" name="actionTaken" rows={2} required defaultValue={i.actionTaken ?? ""} />
                      </FormDialog>
                    )}</TD>
                  </TR>
                ))}
                {incidents.length === 0 && <TR><TD colSpan={6} className="text-slate-500">No incidents recorded.</TD></TR>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        {conf ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Counselling (confidential)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {counselling.map((c) => <div key={c.id} className="text-sm"><p className="font-medium">{studentName(c.student)} — {c.concern} <span className="text-xs font-normal text-slate-500">{fmtDate(c.date)}</span></p><p className="whitespace-pre-wrap text-slate-600">{c.notes}</p>{c.followUp && <p className="text-xs">Follow-up: {c.followUp}</p>}</div>)}
                {counselling.length === 0 && <p className="text-sm text-slate-500">No records.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Sick bay / medical</CardTitle></CardHeader>
              <CardContent>
                <Table><tbody>{medical.map((m) => <TR key={m.id}><TD className="text-xs">{fmtDate(m.date)}</TD><TD className="text-xs">{studentName(m.student)} ({m.student.schoolClass.code})</TD><TD className="text-xs">{m.complaint}{m.treatment ? ` — ${m.treatment}` : ""}{m.referredTo ? ` → ${m.referredTo}` : ""}</TD></TR>)}</tbody></Table>
                {medical.length === 0 && <p className="text-sm text-slate-500">No records.</p>}
              </CardContent>
            </Card>
          </div>
        ) : <Alert>Counselling and medical records are restricted to welfare staff.</Alert>}
      </div>
    </>
  );
}
