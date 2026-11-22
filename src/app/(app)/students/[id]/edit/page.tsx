import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { classTree } from "@/server/queries/lookups";
import { updateStudent } from "@/server/actions/students";
import { StudentForm } from "@/components/student-form";
import { PageHeader } from "@/components/ui/card";
import { studentName } from "@/lib/utils";

export default async function EditStudent({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("students.manage");
  const { id } = await params;
  const [student, tree, combos, houses] = await Promise.all([
    prisma.student.findUnique({ where: { id } }), classTree(), prisma.subjectCombination.findMany({ orderBy: { code: "asc" } }),
    prisma.house.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!student) notFound();
  return (
    <>
      <PageHeader title={`Edit ${studentName(student)}`} description={student.admissionNo} />
      <StudentForm action={updateStudent} tree={tree} combinations={combos} student={student} houses={houses} />
    </>
  );
}
