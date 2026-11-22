import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { classTree } from "@/server/queries/lookups";
import { createStudent } from "@/server/actions/students";
import { StudentForm } from "@/components/student-form";
import { PageHeader } from "@/components/ui/card";

export const metadata = { title: "Register student" };

export default async function NewStudent() {
  await requirePage("students.manage");
  const [tree, combos, houses] = await Promise.all([classTree(), prisma.subjectCombination.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }), prisma.house.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="Register student" description="Fields marked * are required. Default subjects are enrolled automatically and can be changed on the profile." />
      <StudentForm action={createStudent} tree={tree} combinations={combos} houses={houses} />
    </>
  );
}
