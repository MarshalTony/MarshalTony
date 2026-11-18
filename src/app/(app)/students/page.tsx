import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Download, Upload, UserPlus, ArrowUpCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { classTree, streamOptions, classOptions } from "@/server/queries/lookups";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/ui/card";
import { FilterBar } from "@/components/filters";
import { Pagination, SortTH, Table, THead, TH, TR, TD, hrefWith, pageParams, sortParams, sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";
import { studentWhere } from "@/server/queries/students";

export const metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const sort = sortParams(params, ["admissionNo", "lastName", "class"] as const, "lastName");
  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sort.field === "class" ? [{ schoolClass: { order: sort.dir } }, { lastName: "asc" }] : [{ [sort.field]: sort.dir }];
  const where = studentWhere(params);
  const [students, total, tree] = await Promise.all([
    prisma.student.findMany({ where, orderBy, skip, take, include: { schoolClass: true, stream: true } }),
    prisma.student.count({ where }),
    classTree(),
  ]);
  const manage = can(user, "students.manage");
  return (
    <>
      <PageHeader
        title="Students"
        description={`${total.toLocaleString()} matching students`}
        actions={
          <>
            <Button asChild variant="outline"><a href={hrefWith("/api/export/students", params, {})}><Download />Export Excel</a></Button>
            {can(user, "students.import") && <Button asChild variant="outline"><Link href="/imports?kind=students"><Upload />Import</Link></Button>}
            {manage && <Button asChild variant="secondary"><Link href="/students/promote"><ArrowUpCircle />Promote</Link></Button>}
            {manage && <Button asChild><Link href="/students/new"><UserPlus />Register student</Link></Button>}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Name, admission no. or UNEB index"
        filters={[
          { name: "classId", label: "Class", options: classOptions(tree) },
          { name: "streamId", label: "Stream", options: streamOptions(tree) },
          { name: "gender", label: "Gender", options: [{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }] },
          { name: "residence", label: "Residence", options: [{ value: "DAY", label: "Day" }, { value: "BOARDING", label: "Boarding" }] },
          { name: "status", label: "Status", options: ["ACTIVE", "SUSPENDED", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "EXPELLED", "ALL"].map((s) => ({ value: s, label: s })) },
        ]}
      />
      <Table>
        <THead>
          <tr>
            <SortTH label="Adm. No." field="admissionNo" base="/students" params={params} />
            <SortTH label="Name" field="lastName" base="/students" params={params} />
            <SortTH label="Class" field="class" base="/students" params={params} />
            <TH>Gender</TH><TH>Residence</TH><TH>Status</TH>
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
            </TR>
          ))}
          {students.length === 0 && <TR><TD colSpan={6} className="py-8 text-center text-slate-500">No students match these filters.</TD></TR>}
        </tbody>
      </Table>
      <Pagination base="/students" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
