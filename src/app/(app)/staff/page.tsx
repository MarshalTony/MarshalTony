import Link from "next/link";
import { Download, Upload, UserPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/card";
import { FilterBar } from "@/components/filters";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { deleteStaff } from "@/server/actions/staff";
import { RowActions } from "@/components/row-actions";

export const metadata = { title: "Staff" };

export default async function StaffList({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("staff.view");
  const manage = can(user, "staff.manage");
  const params = await searchParams;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);
  const where = {
    AND: [
      q ? { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { staffNo: { contains: q, mode: "insensitive" as const } }, { designation: { contains: q, mode: "insensitive" as const } }] } : {},
      sp(params, "departmentId") ? { departmentId: sp(params, "departmentId") } : {},
      { status: sp(params, "status") ?? "ACTIVE" },
    ],
  };
  const [rows, total, depts] = await Promise.all([
    prisma.staff.findMany({ where, orderBy: { lastName: "asc" }, skip, take, include: { department: true, subjects: { include: { subject: true } } } }),
    prisma.staff.count({ where }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Staff" description={`${total} staff`} actions={
        <>
          <Button asChild variant="outline"><a href={`/api/export/staff?status=${sp(params, "status") ?? "ACTIVE"}`}><Download />Export</a></Button>
          {can(user, "staff.manage") && <Button asChild variant="outline"><Link href="/imports?kind=staff"><Upload />Import</Link></Button>}
          {can(user, "staff.manage") && <Button asChild><Link href="/staff/new"><UserPlus />Register staff</Link></Button>}
        </>
      } />
      {sp(params, "deleted") === "1" && <Alert tone="success" className="mb-4">The record was deleted. The deletion is recorded in the audit log.</Alert>}
      <FilterBar searchPlaceholder="Name, staff no. or designation" filters={[
        { name: "departmentId", label: "Department", options: depts.map((d) => ({ value: d.id, label: d.name })) },
        { name: "status", label: "Status", allowAll: false, value: sp(params, "status") ?? "ACTIVE", options: ["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"].map((s) => ({ value: s, label: s.replace("_", " ") })) },
      ]} />
      <Table>
        <THead><tr><TH>Staff No.</TH><TH>Name</TH><TH>Designation</TH><TH>Department</TH><TH>Subjects</TH><TH>Phone</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></THead>
        <tbody>
          {rows.map((s) => (
            <TR key={s.id}>
              <TD className="font-mono text-xs">{s.staffNo}</TD>
              <TD><Link href={`/staff/${s.id}`} className="font-medium text-brand-800 hover:underline">{s.lastName} {s.firstName}</Link></TD>
              <TD>{s.designation}</TD>
              <TD>{s.department?.name ?? "—"}</TD>
              <TD className="text-xs">{s.subjects.map((x) => x.subject.code).join(", ")}</TD>
              <TD className="text-xs">{s.phone}</TD>
              <TD><StatusBadge status={s.status} /></TD>
              <TD>
                <RowActions
                  label={`${s.lastName} ${s.firstName}`}
                  viewHref={`/staff/${s.id}`}
                  editHref={manage ? `/staff/${s.id}/edit` : undefined}
                  deleteAction={manage ? deleteStaff : undefined}
                  deleteFields={{ id: s.id }}
                  deleteConfirm={`Permanently delete ${s.lastName} ${s.firstName} (${s.staffNo})? Only use this for a record entered by mistake. Staff with allocations, payroll, attendance or other history cannot be deleted — set their status to Exited instead.`}
                />
              </TD>
            </TR>
          ))}
          {rows.length === 0 && <TR><TD colSpan={8} className="py-8 text-center text-slate-500">No staff match these filters.</TD></TR>}
        </tbody>
      </Table>
      <Pagination base="/staff" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
