import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveStaff } from "@/server/actions/staff";
import { StaffForm } from "@/components/staff-form";
import { PageHeader } from "@/components/ui/card";

export default async function NewStaff() {
  const user = await requirePage("staff.manage");
  const [departments, subjects] = await Promise.all([prisma.department.findMany({ orderBy: { name: "asc" } }), prisma.subject.findMany({ where: { isActive: true }, orderBy: [{ level: "asc" }, { name: "asc" }] })]);
  return (
    <>
      <PageHeader title="Register staff" />
      <StaffForm action={saveStaff} departments={departments} subjects={subjects} sensitive={can(user, "hr.sensitive")} />
    </>
  );
}
