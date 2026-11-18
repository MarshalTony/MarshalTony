import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { classTree } from "@/server/queries/lookups";
import { createStudent } from "@/server/actions/students";
import { StudentForm } from "@/components/student-form";
import { PageHeader } from "@/components/ui/card";

export const metadata = { title: "Register student" };

export default async function NewStudent() {
  await requirePage("students.manage");
  const [tree, combos] = await Promise.all([classTree(), prisma.subjectCombination.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })]);
  return (
    <>
      <PageHeader title="Register student" description="Fields marked * are required. Default subjects are enrolled automatically and can be changed on the profile." />
      <StudentForm action={createStudent} tree={tree} combinations={combos} />
    </>
  );
}
