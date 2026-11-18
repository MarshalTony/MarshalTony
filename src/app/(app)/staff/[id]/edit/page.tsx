import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveStaff } from "@/server/actions/staff";
import { StaffForm } from "@/components/staff-form";
import { PageHeader } from "@/components/ui/card";

export default async function EditStaff({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("staff.manage");
  const { id } = await params;
  const [staff, departments, subjects] = await Promise.all([
    prisma.staff.findUnique({ where: { id }, include: { subjects: true } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ where: { isActive: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
  ]);
  if (!staff) notFound();
  const sensitive = can(user, "hr.sensitive");
  // Never send confidential values to users who may not see them.
  const safe = sensitive ? staff : { ...staff, basicSalary: null, bankName: null, bankAccount: null, tinNumber: null, nssfNumber: null };
  return (
    <>
      <PageHeader title={`Edit ${staff.lastName} ${staff.firstName}`} description={staff.staffNo} />
      <StaffForm action={saveStaff} staff={safe as any} departments={departments} subjects={subjects} selectedSubjects={staff.subjects.map((s) => s.subjectId)} sensitive={sensitive} />
    </>
  );
}
