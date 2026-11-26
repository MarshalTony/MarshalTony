import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Download, Upload, UserPlus, ArrowUpCircle, Table2, Camera, ClipboardCheck, ShieldCheck, BarChart3, Flag, Zap, UserCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { classTree } from "@/server/queries/lookups";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/card";
import { StudentFilters } from "@/components/student-filters";
import { PrintListDialog } from "@/components/print-list-dialog";
import { Pagination, SortTH, Table, THead, TH, TR, TD, hrefWith, pageParams, sortParams, sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";
import { MISSING_OPTIONS, studentWhere } from "@/server/queries/students";
import { deleteStudent } from "@/server/actions/students";
import { RowActions } from "@/components/row-actions";
import { MenuButton } from "@/components/menu-button";

export const metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const sort = sortParams(params, ["admissionNo", "lastName", "class"] as const, "lastName");
  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sort.field === "class" ? [{ schoolClass: { order: sort.dir } }, { lastName: "asc" }] : [{ [sort.field]: sort.dir }];
  const where = studentWhere(params);
  const [students, total, tree, subjects, combinations, bySex, byResidence, houses, clubs] = await Promise.all([
    prisma.student.findMany({ where, orderBy, skip, take, include: { schoolClass: true, stream: true } }),
    prisma.student.count({ where }),
    classTree(),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true, level: true } }),
    prisma.subjectCombination.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.student.groupBy({ by: ["gender"], where, _count: true }),
    prisma.student.groupBy({ by: ["residence"], where, _count: true }),
    prisma.house.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const n = (rows: { _count: number }[], pick: (r: any) => boolean) => rows.find(pick)?._count ?? 0;
  const plural = (k: number, word: string) => `${k.toLocaleString()} ${word}${k === 1 ? "" : "s"}`;
  const summary = [
    `${total.toLocaleString()} student${total === 1 ? "" : "s"}`,
    `${plural(n(bySex, (r) => r.gender === "MALE"), "boy")} · ${plural(n(bySex, (r) => r.gender === "FEMALE"), "girl")}`,
    `${n(byResidence, (r) => r.residence === "DAY")} day · ${n(byResidence, (r) => r.residence === "BOARDING")} boarding`,
  ];
  const manage = can(user, "students.manage");
  const classQ = sp(params, "classId") ? `?classId=${sp(params, "classId")}` : "";
  return (
    <>
      <PageHeader
        title="Students"
        description="Search and filter the student register. The Excel export uses the same filters."
        actions={
          <>
            <PrintListDialog total={total} canContacts={can(user, "students.manage", "guardians.manage") || can(user, "attendance.take")} />
            <MenuButton label="Reports" icon={<BarChart3 />} items={[
              { href: "/students/statistics", label: "Statistics", hint: "Enrolment by class, age and sex (EMIS)", icon: <BarChart3 /> },
              { href: "/students/data-check", label: "Data check", hint: "Missing or wrong records, with fixes", icon: <ShieldCheck /> },
              { href: hrefWith("/api/export/students", params, {}), label: "Export to Excel", hint: "The list below, with its filters", icon: <Download />, external: true },
            ]} />
            <MenuButton label="Manage" icon={<Table2 />} items={[
              ...(manage ? [{ href: `/students/bulk${classQ}`, label: "Bulk edit", hint: "Change many students of a class at once", icon: <Table2 /> }] : []),
              ...(manage ? [{ href: `/students/photos${classQ}`, label: "Photos", hint: "Add or change passport photos", icon: <Camera /> }] : []),
              { href: "/students/groups", label: "Clubs & Houses", hint: "Members of each house and club", icon: <Flag /> },
              { href: "/students/confirm", label: "Confirm students", hint: "Who has reported this term", icon: <UserCheck /> },
              { href: `/students/clearance${classQ}`, label: "Clearance & leaving", hint: "Clearance board and leaving documents", icon: <ClipboardCheck /> },
              ...(manage ? [{ href: "/students/promote", label: "Promote", hint: "Move classes up to the new year", icon: <ArrowUpCircle /> }] : []),
            ]} />
            {(manage || can(user, "students.import")) && (
              <MenuButton label="Add students" icon={<UserPlus />} variant="default" items={[
                ...(manage ? [{ href: "/students/new", label: "Register one student", hint: "Full form with parent and photo", icon: <UserPlus /> }] : []),
                ...(manage ? [{ href: "/students/quick", label: "Quick registration", hint: "A whole class list, typed or pasted", icon: <Zap /> }] : []),
                ...(can(user, "students.import") ? [{ href: "/imports?kind=students", label: "Import from Excel", hint: "Many classes at once from a template", icon: <Upload /> }] : []),
              ]} />
            )}
          </>
        }
      />
      {sp(params, "deleted") === "1" && <Alert tone="success" className="mb-4">The record was deleted. The deletion is recorded in the audit log.</Alert>}
      <StudentFilters
        classes={tree.map((c) => ({ id: c.id, name: c.name, level: c.level, streams: c.streams }))}
        subjects={subjects.map((x) => ({ value: x.id, label: `${x.name} (${x.level === "O_LEVEL" ? "O" : "A"})`, level: x.level }))}
        combinations={combinations.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        missing={MISSING_OPTIONS}
        houses={houses.map((h) => ({ value: h.id, label: h.name }))}
        clubs={clubs.map((c) => ({ value: c.id, label: c.name }))}
        statuses={["ACTIVE", "SUSPENDED", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "EXPELLED", "ALL"].map((x) => ({ value: x, label: x === "ALL" ? "Any status" : x.charAt(0) + x.slice(1).toLowerCase() }))}
      />
      <p className="mb-2 text-sm text-slate-600">{summary.join("  ·  ")}</p>
      <Table>
        <THead>
          <tr>
            <SortTH label="Adm. No." field="admissionNo" base="/students" params={params} />
            <SortTH label="Name" field="lastName" base="/students" params={params} />
            <SortTH label="Class" field="class" base="/students" params={params} />
            <TH>Gender</TH><TH>Residence</TH><TH>Status</TH><TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {students.map((s) => (
            <TR key={s.id}>
              <TD className="whitespace-nowrap font-mono text-xs">{s.admissionNo}</TD>
              <TD><Link href={`/students/${s.id}`} className="font-medium text-brand-800 hover:underline">{studentName(s)}</Link></TD>
              <TD className="whitespace-nowrap">{s.schoolClass.code} {s.stream.name}</TD>
              <TD>{s.gender === "MALE" ? "M" : "F"}</TD>
              <TD>{s.residence === "DAY" ? "Day" : "Boarding"}</TD>
              <TD><StatusBadge status={s.status} /></TD>
              <TD>
                <RowActions
                  label={studentName(s)}
                  viewHref={`/students/${s.id}`}
                  editHref={manage ? `/students/${s.id}/edit` : undefined}
                  deleteAction={manage ? deleteStudent : undefined}
                  deleteFields={{ id: s.id }}
                  deleteConfirm={`Permanently delete ${studentName(s)} (${s.admissionNo})? Only use this for a record entered by mistake. Students with marks, fees, attendance or other history cannot be deleted — change their status instead.`}
                />
              </TD>
            </TR>
          ))}
          {students.length === 0 && <TR><TD colSpan={7} className="py-8 text-center text-slate-500">No students match these filters.</TD></TR>}
        </tbody>
      </Table>
      <Pagination base="/students" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
