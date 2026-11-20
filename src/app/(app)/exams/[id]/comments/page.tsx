import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveComments } from "@/server/actions/exams";
import { commentBasis } from "@/server/exams/comment-basis";
import { CommentsGrid } from "@/components/comments-grid";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { ordinal, studentName } from "@/lib/utils";

export const metadata = { title: "Report comments" };

export default async function CommentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("reports.comment.class", "reports.comment.dos", "reports.comment.head");
  const { id } = await params;
  const streamId = sp(await searchParams, "streamId");
  if (!streamId) notFound();
  const [exam, stream, school] = await Promise.all([
    prisma.exam.findUnique({ where: { id }, include: { examType: true, classes: { include: { schoolClass: { include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } } } } } } }),
    prisma.stream.findUnique({ where: { id: streamId }, include: { schoolClass: true } }),
    prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { reportTemplate: true } }),
  ]);
  if (!exam || !stream) notFound();
  const isClassTeacher = !!user.staffId && stream.classTeacherId === user.staffId;
  const canClass = (can(user, "reports.comment.class") && isClassTeacher) || can(user, "reports.comment.dos", "reports.comment.head");
  const canDos = can(user, "reports.comment.dos");
  const canHead = can(user, "reports.comment.head");
  if (!canClass && !canDos && !canHead) return <Alert tone="error">Only the class teacher of {stream.schoolClass.code} {stream.name} can write class-teacher comments.</Alert>;

  const results = await prisma.examResult.findMany({
    where: { examId: id, streamId }, include: { student: { include: { reportComments: { where: { examId: id } } } } },
    orderBy: [{ streamPosition: { sort: "asc", nulls: "last" } }, { student: { lastName: "asc" } }],
  });
  const [basis, bank] = await Promise.all([
    commentBasis(id, results.map((r) => r.studentId)),
    prisma.commentTemplate.findMany({ where: { isActive: true }, orderBy: [{ role: "asc" }, { minScore: "desc" }, { createdAt: "asc" }] }),
  ]);
  // The competency card (all S1–S4 exams) prints only class-teacher and head-teacher comments.
  const cbcCard = stream.schoolClass.level === "O_LEVEL" && (school?.reportTemplate as { cbcOLevel?: boolean } | null)?.cbcOLevel !== false;
  const streams = exam.classes.flatMap((c) => c.schoolClass.streams.map((s) => ({ id: s.id, label: `${c.schoolClass.code} ${s.name}` })));
  const anyBasis = basis.values().next().value;

  return (
    <>
      <PageHeader
        title={`Report comments — ${stream.schoolClass.code} ${stream.name}`}
        description={`${exam.name}. Suggestions come from the Comment Bank and match each student's score.`}
        actions={<><Button asChild variant="outline"><Link href="/comment-bank">Comment bank</Link></Button><Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button></>}
      />
      {streams.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-slate-500">Stream:</span>
          {streams.map((s) => (
            <Link key={s.id} href={`/exams/${id}/comments?streamId=${s.id}`} className={`rounded-full border px-2.5 py-0.5 ${s.id === streamId ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white hover:border-brand-400"}`}>{s.label}</Link>
          ))}
        </div>
      )}
      {bank.length === 0 && <Alert tone="warn" className="mb-3">The comment bank is empty — add comments in the Comment bank to get suggestions.</Alert>}
      {results.length === 0 ? <Alert tone="warn">Generate results for this examination first.</Alert> : (
        <CommentsGrid
          action={saveComments}
          examId={id}
          streamId={streamId}
          basisLabel={anyBasis?.label ?? "exam average"}
          showDos={!cbcCard}
          can={{ conduct: canClass, classTeacherComment: canClass, dosComment: canDos, headteacherComment: canHead }}
          bank={bank.map((b) => ({ role: b.role, minScore: Number(b.minScore), maxScore: Number(b.maxScore), text: b.text }))}
          rows={results.map((r) => {
            const c = r.student.reportComments[0];
            const bs = basis.get(r.studentId);
            return {
              studentId: r.studentId, name: studentName(r.student), firstName: r.student.firstName,
              pos: cbcCard ? "" : ordinal(r.streamPosition), score: bs?.score ?? null, grade: bs?.grade ?? null,
              conduct: c?.conduct ?? "", classTeacherComment: c?.classTeacherComment ?? "", dosComment: c?.dosComment ?? "", headteacherComment: c?.headteacherComment ?? "",
            };
          })}
        />
      )}
    </>
  );
}
