import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { autoComments, saveComments } from "@/server/actions/exams";
import { ActionForm, ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { ordinal, studentName } from "@/lib/utils";

export default async function CommentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("reports.comment.class", "reports.comment.dos", "reports.comment.head");
  const { id } = await params;
  const streamId = sp(await searchParams, "streamId");
  if (!streamId) notFound();
  const [exam, stream] = await Promise.all([
    prisma.exam.findUnique({ where: { id } }),
    prisma.stream.findUnique({ where: { id: streamId }, include: { schoolClass: true } }),
  ]);
  if (!exam || !stream) notFound();
  const isClassTeacher = !!user.staffId && stream.classTeacherId === user.staffId;
  const canClass = (can(user, "reports.comment.class") && isClassTeacher) || can(user, "reports.comment.dos", "reports.comment.head");
  const canDos = can(user, "reports.comment.dos");
  const canHead = can(user, "reports.comment.head");
  if (!canClass && !canDos && !canHead) return <Alert tone="error">Only the class teacher of {stream.schoolClass.code} {stream.name} can write class-teacher comments.</Alert>;
  const results = await prisma.examResult.findMany({
    where: { examId: id, streamId }, include: { student: { include: { reportComments: { where: { examId: id } } } } },
    orderBy: [{ streamPosition: { sort: "asc", nulls: "last" } }],
  });
  const area = "w-full min-w-[180px] rounded border border-slate-300 p-1.5 text-xs disabled:bg-slate-50";
  return (
    <>
      <PageHeader title={`Report comments — ${stream.schoolClass.code} ${stream.name}`} description={exam.name} actions={
        <>
          {(canDos || canHead) && <ConfirmAction action={autoComments} fields={{ examId: id, streamId }} label={`Suggest ${canHead ? "head" : "DOS"} comments`} size="default" confirm="Fill EMPTY comments with a suggestion based on each student's average? Existing comments are kept." />}
          <Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button>
        </>
      } />
      {results.length === 0 ? <Alert tone="warn">Generate results first.</Alert> : (
        <ActionForm action={saveComments} submitLabel="Save all comments">
          <input type="hidden" name="examId" value={id} />
          <input type="hidden" name="streamId" value={streamId} />
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="p-2 text-left">Pos.</th><th className="p-2 text-left">Student</th><th className="p-2 text-left">Avg</th><th className="p-2 text-left">Conduct</th><th className="p-2 text-left">Class teacher</th><th className="p-2 text-left">DOS</th><th className="p-2 text-left">Headteacher</th></tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const c = r.student.reportComments[0];
                  return (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="p-2">{ordinal(r.streamPosition)}</td>
                      <td className="whitespace-nowrap p-2">{studentName(r.student)}</td>
                      <td className="p-2">{Number(r.average).toFixed(1)}%</td>
                      <td className="p-1"><input name={`conduct_${r.studentId}`} defaultValue={c?.conduct ?? ""} disabled={!canClass} className="h-8 w-28 rounded border border-slate-300 px-1.5 text-xs disabled:bg-slate-50" placeholder="Good" /></td>
                      <td className="p-1"><textarea name={`classTeacherComment_${r.studentId}`} defaultValue={c?.classTeacherComment ?? ""} disabled={!canClass} rows={2} className={area} /></td>
                      <td className="p-1"><textarea name={`dosComment_${r.studentId}`} defaultValue={c?.dosComment ?? ""} disabled={!canDos} rows={2} className={area} /></td>
                      <td className="p-1"><textarea name={`headteacherComment_${r.studentId}`} defaultValue={c?.headteacherComment ?? ""} disabled={!canHead} rows={2} className={area} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ActionForm>
      )}
    </>
  );
}
