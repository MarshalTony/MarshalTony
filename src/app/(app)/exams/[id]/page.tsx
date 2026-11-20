import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, FileText, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import {
  approveAllSubmitted, generateResultsAction, notifyResults, reviewMarks, saveExamSubjects, setExamStatus,
} from "@/server/actions/exams";
import { ActionForm, CheckboxField, ConfirmAction, FormDialog, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { fmtDate, fmtDateTime, isoDate } from "@/lib/utils";
import { resultsReadiness } from "@/server/exams/readiness";
import { ResultsReadinessAlert } from "@/components/results-readiness";
import { ExamEditActions } from "@/components/exams/exam-edit-actions";

export default async function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("exams.manage", "marks.enter", "marks.approve", "results.view");
  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      examType: true, term: { include: { academicYear: true } }, components: { include: { componentExam: true } },
      classes: { include: { schoolClass: { include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } } } }, orderBy: { schoolClass: { order: "asc" } } },
      subjects: { include: { subject: true }, orderBy: { subject: { name: "asc" } } },
      submissions: true,
      _count: { select: { marks: true, results: true } },
    },
  });
  if (!exam) notFound();
  const manage = can(user, "exams.manage");
  const editLists = manage ? await Promise.all([
    prisma.examType.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.term.findMany({ include: { academicYear: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { number: "desc" }] }),
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]).then(([types, terms, classes]) => ({ types, terms, classes })) : { types: [], terms: [], classes: [] };
  const readiness = await resultsReadiness(exam.id);
  const approve = can(user, "marks.approve");
  const levelSubjects = await prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const markRows = await prisma.$queryRaw<{ streamId: string; subjectId: string; n: bigint }[]>`
    SELECT s."streamId", m."subjectId", COUNT(*)::bigint AS n FROM "Mark" m JOIN "Student" s ON s.id = m."studentId" WHERE m."examId" = ${id} GROUP BY 1, 2`;
  const countOf = (streamId: string, subjectId: string) => Number(markRows.find((r) => r.streamId === streamId && r.subjectId === subjectId)?.n ?? 0);
  const submitted = exam.submissions.filter((s) => s.status === "SUBMITTED").length;
  const approved = exam.submissions.filter((s) => s.status === "APPROVED").length;
  const next: Record<string, { to: string; label: string; variant: "default" | "success" | "outline" }[]> = {
    DRAFT: [{ to: "OPEN", label: "Open for marks entry", variant: "default" }],
    OPEN: [{ to: "CLOSED", label: "Close marks entry", variant: "outline" }, { to: "DRAFT", label: "Back to draft", variant: "outline" }],
    CLOSED: [{ to: "PUBLISHED", label: "Publish results", variant: "success" }, { to: "OPEN", label: "Re-open marks entry", variant: "outline" }],
    PUBLISHED: [{ to: "CLOSED", label: "Unpublish", variant: "outline" }],
  };
  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${exam.examType.name} · ${exam.term.academicYear.name} ${exam.term.name}${exam.startDate ? ` · ${fmtDate(exam.startDate)} – ${fmtDate(exam.endDate)}` : ""}`}
        actions={
          <>
            <StatusBadge status={exam.status} />
            {manage && next[exam.status].map((n) => (
              <ConfirmAction key={n.to} action={setExamStatus} fields={{ examId: exam.id, status: n.to }} label={n.label} variant={n.variant} size="default"
                confirm={n.to === "PUBLISHED" ? "Publish results? Parents and students will be able to see them and download report cards." : undefined} />
            ))}
            {manage && (
              <ExamEditActions
                exam={{ id: exam.id, name: exam.name, examTypeId: exam.examTypeId, termId: exam.termId, startDate: exam.startDate, endDate: exam.endDate, isComposite: exam.isComposite, classIds: exam.classes.map((c) => c.classId), marks: exam._count.marks, results: exam._count.results }}
                examTypes={editLists.types.map((t) => ({ value: t.id, label: t.name }))}
                terms={editLists.terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }))}
                classes={editLists.classes.map((c) => ({ value: c.id, label: c.code }))}
              />
            )}
          </>
        }
      />
      {exam.isComposite && (
        <Alert className="mb-4">
          Combined examination: {exam.components.map((c) => `${c.componentExam.name} (${Number(c.weight)}%)`).join(" + ")}. Marks are calculated from the components — approve marks in each component exam, then generate results here.
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {exam.classes.map(({ schoolClass: c }) => {
            const subs = exam.subjects.filter((s) => s.classId === c.id);
            const candidates = levelSubjects.filter((s) => s.level === c.level);
            return (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <div className="flex flex-wrap gap-1">
                    {exam._count.results > 0 && can(user, "results.view") && <Button asChild size="sm" variant="secondary"><Link href={`/exams/${exam.id}/results?classId=${c.id}`}><BarChart3 />Results</Link></Button>}
                    {exam._count.results > 0 && can(user, "results.view") && <Button asChild size="sm" variant="outline"><Link href={`/exams/${exam.id}/analysis?classId=${c.id}`}>Analysis</Link></Button>}
                    {manage && (
                      <FormDialog trigger="Subjects & max marks" title={`${c.name}: subjects in this exam`} action={saveExamSubjects} triggerVariant="outline" triggerSize="sm" wide>
                        <input type="hidden" name="examId" value={exam.id} />
                        <input type="hidden" name="classId" value={c.id} />
                        <div className="space-y-1">
                          {candidates.map((s) => {
                            const es = subs.find((x) => x.subjectId === s.id);
                            return (
                              <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <label className="flex min-w-[220px] flex-1 items-center gap-2"><input type="checkbox" name="subjectIds[]" value={s.id} defaultChecked={!!es} />{s.name}</label>
                                {!exam.isComposite && <input type="number" name={`max_${s.id}`} defaultValue={es ? Number(es.maxMarks) : 100} className="h-8 w-20 rounded border border-slate-300 px-2" aria-label={`Max marks for ${s.name}`} />}
                                <input type="date" name={`date_${s.id}`} defaultValue={isoDate(es?.examDate)} className="h-8 rounded border border-slate-300 px-2" aria-label={`Paper date for ${s.name}`} />
                              </div>
                            );
                          })}
                        </div>
                      </FormDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {subs.length === 0 ? <p className="text-sm text-slate-500">No subjects configured.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Max</th>{c.streams.map((st) => <th key={st.id} className="p-2 text-left">{c.code} {st.name}</th>)}</tr>
                        </thead>
                        <tbody>
                          {subs.map((es) => (
                            <tr key={es.id} className="border-t border-slate-100">
                              <td className="p-2">{es.subject.name}</td>
                              <td className="p-2">{exam.isComposite ? "%" : Number(es.maxMarks)}</td>
                              {c.streams.map((st) => {
                                const sub = exam.submissions.find((x) => x.streamId === st.id && x.subjectId === es.subjectId);
                                const n = countOf(st.id, es.subjectId);
                                return (
                                  <td key={st.id} className="p-2 align-top">
                                    {exam.isComposite ? <span className="text-xs text-slate-400">calculated</span> : (
                                      <div className="space-y-1">
                                        <Link className="block text-xs text-brand-700 hover:underline" href={`/exams/${exam.id}/marks?streamId=${st.id}&subjectId=${es.subjectId}`}>{n} marks</Link>
                                        {readiness.approvalRequired && <StatusBadge status={sub?.status ?? "NOT STARTED"} />}
                                        {readiness.approvalRequired && approve && sub?.status === "SUBMITTED" && (
                                          <div className="flex gap-1">
                                            <ConfirmAction action={reviewMarks} fields={{ submissionId: sub.id, decision: "APPROVED" }} label="Approve" variant="success" />
                                            <FormDialog trigger="Return" title="Return marks for correction" action={reviewMarks} triggerVariant="outline" triggerSize="sm">
                                              <input type="hidden" name="submissionId" value={sub.id} />
                                              <input type="hidden" name="decision" value="REJECTED" />
                                              <TextField label="Reason" name="note" required />
                                            </FormDialog>
                                          </div>
                                        )}
                                        {readiness.approvalRequired && sub?.reviewNote && <p className="text-xs text-red-700">{sub.reviewNote}</p>}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="space-y-5">
          {!readiness.approvalRequired ? (
            <Card>
              <CardHeader><CardTitle>Marks</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">{exam._count.marks} marks entered. DOS approval is switched off: saved marks count straight away. Close the examination to stop marks entry.</CardContent>
            </Card>
          ) : (
          <Card>
            <CardHeader><CardTitle>Marks approval</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{exam._count.marks} marks entered · {submitted} awaiting approval · {approved} approved</p>
              {approve && submitted > 0 && <ConfirmAction action={approveAllSubmitted} fields={{ examId: exam.id }} label={`Approve all ${submitted} submitted`} variant="success" confirm="Approve every submitted mark sheet?" />}
            </CardContent>
          </Card>
          )}
          {manage && (
            <Card>
              <CardHeader><CardTitle>Results</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-slate-600">Last generated: {fmtDateTime(exam.resultsGeneratedAt)}. Re-generate after corrections or changes to grading rules.</p>
                <ResultsReadinessAlert r={readiness} />
                <ActionForm action={generateResultsAction} submitLabel="Generate results">
                  <input type="hidden" name="examId" value={exam.id} />
                  {readiness.approvalRequired && <CheckboxField name="includeUnapproved" label="Include marks not yet approved (provisional)" />}
                </ActionForm>
              </CardContent>
            </Card>
          )}
          {exam._count.results > 0 && (
            <Card>
              <CardHeader><CardTitle>Report cards</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {exam.classes.flatMap(({ schoolClass: c }) => c.streams.map((st) => (
                  <div key={st.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{c.code} {st.name}</span>
                    <span className="flex gap-1">
                      <Button asChild size="sm" variant="outline"><Link href={`/exams/${exam.id}/comments?streamId=${st.id}`}><MessageSquare />Comments</Link></Button>
                      {can(user, "reportcards.generate") && <Button asChild size="sm" variant="outline"><a href={`/api/pdf/report-card?examId=${exam.id}&streamId=${st.id}`} target="_blank"><FileText />PDFs</a></Button>}
                    </span>
                  </div>
                )))}
                {exam.status === "PUBLISHED" && can(user, "communication.send") && (
                  <ConfirmAction action={notifyResults} fields={{ examId: exam.id }} label="Notify parents (SMS/email)" variant="secondary" confirm="Send a results notification to every primary guardian?" />
                )}
                {exam.status !== "PUBLISHED" && <p className="text-xs text-slate-500"><Badge color="amber">Not published</Badge> Parents and students cannot see these results yet.</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
