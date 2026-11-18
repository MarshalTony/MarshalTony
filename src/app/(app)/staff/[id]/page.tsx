/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { addQualification, createStaffAccount, deleteStaff, removeQualification } from "@/server/actions/staff";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, DL, PageHeader, StatusBadge } from "@/components/ui/card";
import { ConfirmAction, FormDialog, Grid, TextField } from "@/components/forms";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, ugx } from "@/lib/utils";

export default async function StaffProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("staff.view");
  const { id } = await params;
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const s = await prisma.staff.findUnique({
    where: { id },
    include: {
      department: true, user: true, qualifications: true, subjects: { include: { subject: true } }, classTeacherOf: { include: { schoolClass: true } },
      allocations: { where: { academicYearId: year?.id }, include: { subject: true, stream: { include: { schoolClass: true } } } },
      leaves: { orderBy: { startDate: "desc" }, take: 5 },
    },
  });
  if (!s) notFound();
  const sensitive = can(user, "hr.sensitive");
  const manage = can(user, "staff.manage");
  const roles = can(user, "users.manage") && !s.userId ? await prisma.role.findMany({ where: { code: { notIn: ["PARENT", "STUDENT"] } }, orderBy: { name: "asc" } }) : [];
  return (
    <>
      <PageHeader title={`${s.lastName} ${s.firstName}`} description={`${s.staffNo} · ${s.designation}`} actions={manage && (
        <>
          <Button asChild><Link href={`/staff/${s.id}/edit`}><Pencil />Edit</Link></Button>
          <ConfirmAction action={deleteStaff} fields={{ id: s.id, fromProfile: "true" }} label="Delete" variant="destructive" size="default" icon={<Trash2 />}
            confirm={`Permanently delete ${s.lastName} ${s.firstName} (${s.staffNo})? Only use this for a record entered by mistake. Staff with allocations, payroll, attendance or other history cannot be deleted — set their status to Exited instead.`} />
        </>
      )} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle><StatusBadge status={s.status} /></CardHeader>
            <CardContent className="flex flex-col gap-5 sm:flex-row">
              {s.photoFileId ? <img src={`/api/files/${s.photoFileId}`} alt="" className="h-32 w-28 rounded border object-cover" /> : <div className="flex h-32 w-28 items-center justify-center rounded border bg-slate-50 text-xs text-slate-400">No photo</div>}
              <DL cols={3} items={[
                ["Gender", s.gender === "MALE" ? "Male" : "Female"], ["Date of birth", fmtDate(s.dateOfBirth)], ["Phone", s.phone], ["Email", s.email],
                ["Department", s.department?.name], ["Employment", s.employmentType.replace("_", " ")], ["Joined", fmtDate(s.dateJoined)],
                ["Registration no.", s.registrationNo], ["NIN", s.nationalId], ["Class teacher of", s.classTeacherOf.map((c) => `${c.schoolClass.code} ${c.name}`).join(", ") || "—"],
                ["Account", s.user ? s.user.username : "None"],
                ...(sensitive ? ([["Basic salary", s.basicSalary ? ugx(s.basicSalary) : "—"], ["Bank", [s.bankName, s.bankAccount].filter(Boolean).join(" ")], ["TIN / NSSF", [s.tinNumber, s.nssfNumber].filter(Boolean).join(" / ")]] as [string, string][]) : []),
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Teaching load ({year?.name})</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-1">{s.subjects.map((x) => <Badge key={x.subjectId} color="blue">{x.subject.name}</Badge>)}</div>
              <Table>
                <THead><tr><TH>Subject</TH><TH>Stream</TH></tr></THead>
                <tbody>
                  {s.allocations.map((a) => <TR key={a.id}><TD>{a.subject.name}</TD><TD>{a.stream.schoolClass.code} {a.stream.name}</TD></TR>)}
                  {s.allocations.length === 0 && <TR><TD colSpan={2} className="text-slate-500">No allocations. Allocate from Classes & Subjects → Teacher allocations.</TD></TR>}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Qualifications</CardTitle>
              {manage && (
                <FormDialog trigger="Add" title="Add qualification" action={addQualification} triggerSize="sm">
                  <input type="hidden" name="staffId" value={s.id} />
                  <TextField label="Qualification" name="title" required placeholder="Bachelor of Science with Education" />
                  <Grid><TextField label="Institution" name="institution" /><TextField label="Year" name="year" type="number" /></Grid>
                </FormDialog>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {s.qualifications.map((q) => (
                <div key={q.id} className="flex items-start justify-between gap-2 text-sm">
                  <div><p className="font-medium">{q.title}</p><p className="text-xs text-slate-500">{[q.institution, q.year].filter(Boolean).join(", ")}</p></div>
                  {manage && <ConfirmAction action={removeQualification} fields={{ id: q.id }} label="Remove" confirm="Remove this qualification?" />}
                </div>
              ))}
              {s.qualifications.length === 0 && <p className="text-sm text-slate-500">None recorded.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent leave</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {s.leaves.map((l) => <p key={l.id}>{l.type}: {fmtDate(l.startDate)} – {fmtDate(l.endDate)} <StatusBadge status={l.status} /></p>)}
              {s.leaves.length === 0 && <p className="text-slate-500">No leave requests.</p>}
            </CardContent>
          </Card>
          {roles.length > 0 && (
            <Card>
              <CardHeader><CardTitle>System account</CardTitle></CardHeader>
              <CardContent>
                <FormDialog trigger="Create login account" title="Create a login account" action={createStaffAccount} triggerVariant="secondary" wide>
                  <input type="hidden" name="staffId" value={s.id} />
                  <TextField label="Username" name="username" required defaultValue={`${s.firstName}.${s.lastName}`.toLowerCase().replace(/[^a-z.]/g, "")} />
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {roles.map((r) => <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roleIds[]" value={r.id} defaultChecked={r.code === "TEACHER" && s.isTeaching} />{r.name}</label>)}
                  </div>
                </FormDialog>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
