import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { MarksSheet } from "@/components/sheets/marks-sheet";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";

export const metadata = { title: "Marks entry" };

export default async function MarksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("marks.enter", "marks.enter.any", "marks.approve");
  const { id } = await params;
  const q = await searchParams;
  const streamId = sp(q, "streamId");
  const subjectId = sp(q, "subjectId");
  if (!streamId || !subjectId) notFound();
  const exam = await prisma.exam.findUnique({ where: { id }, select: { name: true } });
  if (!exam) notFound();
  return (
    <>
      <PageHeader title="Marks entry" description={exam.name} actions={<Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button>} />
      <MarksSheet user={user} examId={id} streamId={streamId} subjectId={subjectId} correctionRequested={sp(q, "correct") === "1"} selfHref={`/exams/${id}/marks?streamId=${streamId}&subjectId=${subjectId}`} />
    </>
  );
}
