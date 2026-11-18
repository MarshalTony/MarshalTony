import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { decideAdvance, decideLeave, requestAdvance, requestLeave, saveAppraisal } from "@/server/actions/hr";
import { ActionForm, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

export const metadata = { title: "HR & leave" };
const TYPES = ["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY", "OTHER"].map((t) => ({ value: t, label: t.toLowerCase() }));

export default async function HRPage() {
  const user = await requirePage();
  const approver = can(user, "hr.leave.approve");
  const manage = can(user, "staff.manage");
  const payroll = can(user, "payroll.manage");
  const [mine, pending, recent, staff, advances, appraisals] = await Promise.all([
    user.staffId ? prisma.leaveRequest.findMany({ where: { staffId: user.staffId }, orderBy: { startDate: "desc" }, take: 10 }) : [],
    approver ? prisma.leaveRequest.findMany({ where: { status: "PENDING" }, include: { staff: true }, orderBy: { startDate: "asc" } }) : [],
    approver || manage ? prisma.leaveRequest.findMany({ where: { status: { not: "PENDING" } }, include: { staff: true }, orderBy: { decidedAt: "desc" }, take: 15 }) : [],
    manage || payroll ? prisma.staff.findMany({ where: { status: { not: "EXITED" } }, orderBy: { lastName: "asc" } }) : [],
    payroll || approver ? prisma.salaryAdvance.findMany({ include: { staff: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    manage ? prisma.staffAppraisal.findMany({ include: { staff: true }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
  ]);
  const staffOpts = staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName} (${s.staffNo})` }));
  return (
    <>
      <PageHeader title="HR, leave & payroll" actions={payroll && <Button asChild variant="secondary"><Link href="/hr/payroll">Payroll</Link></Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader><CardTitle>Apply for leave</CardTitle></CardHeader>
          <CardContent>
            {!user.staffId && !manage ? <Alert>Your account is not linked to a staff record.</Alert> : (
              <ActionForm action={requestLeave} submitLabel="Submit request" resetOnSuccess>
                {manage && <SelectField label="Staff member (HR may apply on behalf)" name="staffId" placeholder="Myself" options={staffOpts} />}
                <SelectField label="Type" name="type" options={TYPES} />
                <Grid><TextField label="From" name="startDate" type="date" required defaultValue={isoDate(new Date())} /><TextField label="To" name="endDate" type="date" required /></Grid>
                <TextAreaField label="Reason" name="reason" rows={2} />
              </ActionForm>
            )}
            {mine.length > 0 && (
              <div className="mt-4 space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase text-slate-500">My requests</p>
                {mine.map((l) => <p key={l.id}>{l.type.toLowerCase()} {fmtDate(l.startDate)}–{fmtDate(l.endDate)} <StatusBadge status={l.status} />{l.decisionNote && <span className="text-xs text-slate-500"> — {l.decisionNote}</span>}</p>)}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          {approver && (
            <Card>
              <CardHeader><CardTitle>Leave awaiting decision ({pending.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>Staff</TH><TH>Type</TH><TH>Dates</TH><TH>Days</TH><TH>Reason</TH><TH /></tr></THead>
                  <tbody>
                    {pending.map((l) => (
                      <TR key={l.id}>
                        <TD>{l.staff.lastName} {l.staff.firstName}</TD><TD className="text-xs">{l.type}</TD>
                        <TD className="whitespace-nowrap text-xs">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</TD>
                        <TD>{Math.round((+l.endDate - +l.startDate) / 86400_000) + 1}</TD><TD className="text-xs">{l.reason}</TD>
                        <TD className="flex justify-end gap-1">
                          <ConfirmAction action={decideLeave} fields={{ id: l.id, decision: "APPROVED" }} label="Approve" variant="success" />
                          <FormDialog trigger="Reject" title="Reject leave" action={decideLeave} triggerVariant="outline" triggerSize="sm">
                            <input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="REJECTED" /><TextField label="Reason" name="note" required />
                          </FormDialog>
                        </TD>
                      </TR>
                    ))}
                    {pending.length === 0 && <TR><TD colSpan={6} className="text-slate-500">Nothing pending.</TD></TR>}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          )}
          {recent.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent leave decisions</CardTitle></CardHeader>
              <CardContent><Table><tbody>{recent.map((l) => <TR key={l.id}><TD>{l.staff.lastName} {l.staff.firstName}</TD><TD className="text-xs">{l.type}</TD><TD className="text-xs">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</TD><TD><StatusBadge status={l.status} /></TD></TR>)}</tbody></Table></CardContent>
            </Card>
          )}
          {(payroll || approver) && (
            <Card>
              <CardHeader>
                <CardTitle>Salary advances</CardTitle>
                {payroll && (
                  <FormDialog trigger="Record advance" title="Salary advance" action={requestAdvance} triggerSize="sm">
                    <SelectField label="Staff" name="staffId" required options={staffOpts} />
                    <Grid><TextField label="Amount (UGX)" name="amount" type="number" min="1" required /><TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required /></Grid>
                    <TextField label="Reason" name="reason" />
                  </FormDialog>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>Staff</TH><TH>Date</TH><TH className="text-right">Amount</TH><TH className="text-right">Recovered</TH><TH>Status</TH><TH /></tr></THead>
                  <tbody>
                    {advances.map((a) => (
                      <TR key={a.id}>
                        <TD>{a.staff.lastName} {a.staff.firstName}</TD><TD className="text-xs">{fmtDate(a.date)}</TD><TD className="text-right">{ugx(a.amount)}</TD><TD className="text-right">{ugx(a.recovered)}</TD><TD><StatusBadge status={a.status} /></TD>
                        <TD className="flex justify-end gap-1">{approver && a.status === "PENDING" && <><ConfirmAction action={decideAdvance} fields={{ id: a.id, decision: "APPROVED" }} label="Approve" variant="success" /><ConfirmAction action={decideAdvance} fields={{ id: a.id, decision: "REJECTED" }} label="Reject" /></>}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          )}
          {manage && (
            <Card>
              <CardHeader>
                <CardTitle>Performance appraisals</CardTitle>
                <FormDialog trigger="New appraisal" title="Staff appraisal" action={saveAppraisal} triggerSize="sm" wide>
                  <SelectField label="Staff" name="staffId" required options={staffOpts} />
                  <Grid><TextField label="Period" name="period" required placeholder="2026 Term 3" /><TextField label="Score (0–100)" name="score" type="number" min="0" max="100" required /></Grid>
                  <TextAreaField label="Strengths" name="strengths" rows={2} /><TextAreaField label="Areas for improvement" name="improvements" rows={2} />
                </FormDialog>
              </CardHeader>
              <CardContent><Table><tbody>{appraisals.map((a) => <TR key={a.id}><TD>{a.staff.lastName} {a.staff.firstName}</TD><TD className="text-xs">{a.period}</TD><TD className="font-semibold">{a.score}</TD><TD className="text-xs">{a.strengths}</TD></TR>)}</tbody></Table></CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
