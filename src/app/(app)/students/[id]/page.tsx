/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, IdCard, Pencil, Printer, Trash2, LogOut } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import {
  changeStudentStatus, createStudentAccount, deleteStudent, linkGuardian, saveGuardian, setStudentSubjects, transferStream, unlinkGuardian, createGuardianAccount,
} from "@/server/actions/students";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, DL, PageHeader, StatusBadge } from "@/components/ui/card";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { ResultsHistory } from "@/components/results-history";
import { balanceOf } from "@/lib/fees";
import { fmtDate, studentName, ugx } from "@/lib/utils";

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("students.view");
  const { id } = await params;
  const s = await prisma.student.findUnique({
    where: { id },
    include: {
      schoolClass: { include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } } }, stream: true, combination: true, user: true,
      guardians: { include: { guardian: { include: { user: true } } } },
      enrollments: { include: { academicYear: true, schoolClass: true, stream: true }, orderBy: { academicYear: { startDate: "desc" } } },
    },
  });
  if (!s) notFound();
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const [subjects, levelSubjects, allGuardians, ledger, attendance] = await Promise.all([
    prisma.studentSubject.findMany({ where: { studentId: id, academicYearId: year?.id }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.subject.findMany({ where: { level: s.schoolClass.level, isActive: true }, orderBy: { name: "asc" } }),
    can(user, "guardians.manage") ? prisma.guardian.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true, phone: true } }) : [],
    can(user, "fees.view") ? prisma.ledgerEntry.findMany({ where: { studentId: id }, select: { debit: true, credit: true } }) : null,
    prisma.studentAttendance.groupBy({ by: ["status"], where: { studentId: id }, _count: true }),
  ]);
  const combos = await prisma.subjectCombination.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  const manage = can(user, "students.manage");
  const enrolled = new Set(subjects.map((x) => x.subjectId));
  const attCount = (k: string) => attendance.find((a) => a.status === k)?._count ?? 0;

  return (
    <>
      <PageHeader
        title={studentName(s)}
        description={`${s.admissionNo} · ${s.schoolClass.name} ${s.stream.name} · ${s.residence === "DAY" ? "Day scholar" : "Boarder"}`}
        actions={
          <>
            <Button asChild variant="outline"><a href={`/api/pdf/admission-form/${s.id}`} target="_blank"><Printer />Admission form</a></Button>
            <Button asChild variant="outline"><a href={`/api/pdf/id-cards?studentId=${s.id}`} target="_blank"><IdCard />ID card</a></Button>
            {can(user, "fees.view") && <Button asChild variant="outline"><Link href={`/fees/students/${s.id}`}><FileText />Fees account</Link></Button>}
            <Button asChild variant="outline"><Link href={`/students/${s.id}/leaving`}><LogOut />Leaving & clearance</Link></Button>
            {manage && <Button asChild><Link href={`/students/${s.id}/edit`}><Pencil />Edit</Link></Button>}
            {manage && <ConfirmAction action={deleteStudent} fields={{ id: s.id, fromProfile: "true" }} label="Delete" variant="destructive" size="default" icon={<Trash2 />}
              confirm={`Permanently delete ${studentName(s)} (${s.admissionNo})? Only use this for a record entered by mistake. Students with marks, fees, attendance or other history cannot be deleted — use Change status instead.`} />}
          </>
        }
      />
      {s.status !== "ACTIVE" && <Alert tone="warn" className="mb-4">Status: {s.status}{s.exitDate ? ` since ${fmtDate(s.exitDate)}` : ""}{s.exitReason ? ` — ${s.exitReason}` : ""}</Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Student details</CardTitle><StatusBadge status={s.status} /></CardHeader>
            <CardContent className="flex flex-col gap-5 sm:flex-row">
              <div className="shrink-0">
                {s.photoFileId ? <img src={`/api/files/${s.photoFileId}`} alt="Passport photo" className="h-32 w-28 rounded-md border object-cover" />
                  : <div className="flex h-32 w-28 items-center justify-center rounded-md border bg-slate-50 text-xs text-slate-400">No photo</div>}
              </div>
              <DL cols={3} items={[
                ["Gender", s.gender === "MALE" ? "Male" : "Female"], ["Date of birth", fmtDate(s.dateOfBirth)], ["Admitted", fmtDate(s.admissionDate)],
                ["Class", `${s.schoolClass.name} ${s.stream.name}`], ["Combination", s.combination?.code ?? "—"], ["Residence", s.residence === "DAY" ? "Day" : "Boarding"],
                ["Nationality", s.nationality], ["Religion", s.religion], ["Previous school", s.previousSchool],
                ["UNEB index no.", s.unebIndexNo], ["LIN", s.linNumber], ["SchoolPay code", s.schoolPayCode], ["Home address", s.homeAddress],
                ["Emergency contact", s.emergencyContactName ? `${s.emergencyContactName} (${s.emergencyContactPhone ?? "—"})` : "—"],
                ["Medical information", s.medicalInfo], ["Portal account", s.user ? `${s.user.username}${s.user.isActive ? "" : " (inactive)"}` : "None"],
              ]} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subjects ({year?.name})</CardTitle>
              {(manage || can(user, "academics.manage")) && (
                <FormDialog trigger="Change subjects" title="Subjects for the current year" action={setStudentSubjects} triggerVariant="outline" triggerSize="sm" wide>
                  <input type="hidden" name="id" value={s.id} />
                  {s.schoolClass.level === "A_LEVEL" && (
                    <SelectField label="Combination" name="combinationId" defaultValue={s.combinationId ?? ""} placeholder="— none —" options={combos.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))} />
                  )}
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {levelSubjects.map((sub) => (
                      <label key={sub.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="subjectIds[]" value={sub.id} defaultChecked={enrolled.has(sub.id)} />
                        {sub.name} <span className="text-xs text-slate-400">{sub.category.toLowerCase()}</span>
                      </label>
                    ))}
                  </div>
                </FormDialog>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((x) => <Badge key={x.id} color={x.subject.category === "SUBSIDIARY" ? "purple" : "blue"}>{x.subject.name}</Badge>)}
                {subjects.length === 0 && <p className="text-sm text-slate-500">No subjects enrolled for the current year.</p>}
              </div>
            </CardContent>
          </Card>

          <ResultsHistory studentId={s.id} canPrint={can(user, "reportcards.generate", "results.view")} />

          <Card>
            <CardHeader><CardTitle>Class history</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Year</TH><TH>Class</TH><TH>Outcome</TH></tr></THead>
                <tbody>{s.enrollments.map((e) => <TR key={e.id}><TD>{e.academicYear.name}</TD><TD>{e.schoolClass.name} {e.stream.name}</TD><TD><StatusBadge status={e.status} /></TD></TR>)}</tbody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {ledger && (
            <Card>
              <CardHeader><CardTitle>Fees balance</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold ${balanceOf(ledger) > 0 ? "text-red-700" : "text-emerald-700"}`}>{ugx(balanceOf(ledger))}</p>
                <p className="text-xs text-slate-500">{balanceOf(ledger) > 0 ? "Outstanding" : balanceOf(ledger) < 0 ? "Credit (prepaid)" : "Fully paid"}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Attendance (all time)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <span>Present: <b>{attCount("PRESENT")}</b></span><span>Absent: <b>{attCount("ABSENT")}</b></span>
              <span>Late: <b>{attCount("LATE")}</b></span><span>Excused: <b>{attCount("EXCUSED")}</b></span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Parents & guardians</CardTitle>
              {can(user, "guardians.manage") && (
                <div className="flex gap-1">
                  <FormDialog trigger="Add new" title="Add a parent / guardian" action={saveGuardian} triggerSize="sm" triggerVariant="secondary">
                    <input type="hidden" name="studentId" value={s.id} />
                    <GuardianFields />
                  </FormDialog>
                  {allGuardians.length > 0 && (
                    <FormDialog trigger="Link existing" title="Link an existing parent" action={linkGuardian} triggerSize="sm" triggerVariant="outline">
                      <input type="hidden" name="studentId" value={s.id} />
                      <SelectField label="Parent / guardian" name="guardianId" required placeholder="Select" options={allGuardians.map((g) => ({ value: g.id, label: `${g.fullName} (${g.phone})` }))} />
                      <SelectField label="Relationship" name="relationship" required options={["Father", "Mother", "Guardian", "Sponsor", "Other"].map((r) => ({ value: r, label: r }))} />
                      <CheckboxField name="isPrimary" label="Primary contact" />
                    </FormDialog>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {s.guardians.map((g) => (
                <div key={g.guardianId} className="rounded border border-slate-200 p-3 text-sm">
                  <p className="font-medium">{g.guardian.fullName} {g.isPrimary && <Badge color="green">Primary</Badge>}</p>
                  <p className="text-slate-600">{g.relationship} · {g.guardian.phone}{g.guardian.email ? ` · ${g.guardian.email}` : ""}</p>
                  <p className="text-xs text-slate-500">Portal: {g.guardian.user ? g.guardian.user.username : "no account"}</p>
                  {can(user, "guardians.manage") && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {!g.guardian.userId && <ConfirmAction action={createGuardianAccount} fields={{ guardianId: g.guardianId }} label="Create portal account" variant="secondary" />}
                      <ConfirmAction action={unlinkGuardian} fields={{ studentId: s.id, guardianId: g.guardianId }} label="Unlink" confirm="Unlink this guardian from the student?" />
                    </div>
                  )}
                </div>
              ))}
              {s.guardians.length === 0 && <p className="text-sm text-slate-500">No guardian recorded.</p>}
            </CardContent>
          </Card>
          {manage && (
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <FormDialog trigger="Transfer stream" title="Move to another stream" action={transferStream} triggerVariant="outline" triggerSize="sm">
                  <input type="hidden" name="id" value={s.id} />
                  <SelectField label="New stream" name="streamId" required options={s.schoolClass.streams.filter((x) => x.id !== s.streamId).map((x) => ({ value: x.id, label: `${s.schoolClass.code} ${x.name}` }))} placeholder="Select" />
                  <TextField label="Reason" name="reason" />
                </FormDialog>
                <FormDialog trigger="Change status" title="Change student status" action={changeStudentStatus} triggerVariant="outline" triggerSize="sm">
                  <input type="hidden" name="id" value={s.id} />
                  <SelectField label="Status" name="status" defaultValue={s.status} options={["ACTIVE", "SUSPENDED", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "EXPELLED"].map((x) => ({ value: x, label: x }))} />
                  <Grid><TextField label="Date left" name="exitDate" type="date" /></Grid>
                  <TextAreaField label="Reason / destination school" name="exitReason" rows={2} />
                </FormDialog>
                {!s.userId && s.status === "ACTIVE" && <ConfirmAction action={createStudentAccount} fields={{ studentId: s.id }} label="Create student portal account" variant="secondary" />}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function GuardianFields() {
  return (
    <>
      <TextField label="Full name" name="fullName" required />
      <Grid>
        <TextField label="Telephone" name="phone" required />
        <TextField label="Alternative phone" name="altPhone" />
        <TextField label="Email" name="email" type="email" />
        <TextField label="Occupation" name="occupation" />
      </Grid>
      <SelectField label="Relationship" name="relationship" required options={["Father", "Mother", "Guardian", "Sponsor", "Other"].map((r) => ({ value: r, label: r }))} />
      <CheckboxField name="isPrimary" label="Primary contact" />
    </>
  );
}
