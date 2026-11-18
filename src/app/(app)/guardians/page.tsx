import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { createGuardianAccount, saveGuardian } from "@/server/actions/students";
import { ConfirmAction, FormDialog, Grid, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { PageHeader } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Parents & guardians" };

export default async function GuardiansPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("guardians.manage");
  const params = await searchParams;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);
  const where = q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }, { students: { some: { student: { admissionNo: { contains: q, mode: "insensitive" as const } } } } }] } : {};
  const [rows, total] = await Promise.all([
    prisma.guardian.findMany({ where, orderBy: { fullName: "asc" }, skip, take, include: { user: true, students: { include: { student: { include: { schoolClass: true } } } } } }),
    prisma.guardian.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Parents & guardians" description="One parent account covers all linked children." />
      <FilterBar searchPlaceholder="Name, phone, email or child's admission no." />
      <Table>
        <THead><tr><TH>Name</TH><TH>Contacts</TH><TH>Children</TH><TH>Portal</TH><TH /></tr></THead>
        <tbody>
          {rows.map((g) => (
            <TR key={g.id}>
              <TD className="font-medium">{g.fullName}<p className="text-xs font-normal text-slate-500">{g.occupation}</p></TD>
              <TD className="text-xs">{g.phone}{g.altPhone ? ` / ${g.altPhone}` : ""}<br />{g.email}</TD>
              <TD className="text-xs">{g.students.map((l) => <Link key={l.studentId} href={`/students/${l.studentId}`} className="block text-brand-700 hover:underline">{studentName(l.student)} ({l.student.schoolClass.code}) — {l.relationship}</Link>)}</TD>
              <TD className="text-xs">{g.user ? g.user.username : "—"}</TD>
              <TD>
                <div className="flex justify-end gap-1">
                  {!g.userId && <ConfirmAction action={createGuardianAccount} fields={{ guardianId: g.id }} label="Create account" variant="secondary" />}
                  <FormDialog trigger="Edit" title="Edit parent / guardian" action={saveGuardian} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="id" value={g.id} />
                    <TextField label="Full name" name="fullName" defaultValue={g.fullName} required />
                    <Grid>
                      <TextField label="Telephone" name="phone" defaultValue={g.phone} required />
                      <TextField label="Alternative phone" name="altPhone" defaultValue={g.altPhone ?? ""} />
                      <TextField label="Email" name="email" type="email" defaultValue={g.email ?? ""} />
                      <TextField label="Occupation" name="occupation" defaultValue={g.occupation ?? ""} />
                      <TextField label="Address" name="address" defaultValue={g.address ?? ""} />
                      <TextField label="National ID" name="nationalId" defaultValue={g.nationalId ?? ""} />
                    </Grid>
                  </FormDialog>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination base="/guardians" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
