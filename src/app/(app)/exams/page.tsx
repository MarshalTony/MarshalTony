import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { createExam, setExamStatus } from "@/server/actions/exams";
import { Lock, LockOpen } from "lucide-react";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { fmtDate } from "@/lib/utils";
import { ExamEditActions } from "@/components/exams/exam-edit-actions";

export const metadata = { title: "Examinations" };

export default async function ExamsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("exams.manage", "marks.enter", "marks.approve", "results.view");
  const params = await searchParams;
  const current = await prisma.term.findFirst({ where: { isCurrent: true } });
  const termId = sp(params, "termId") ?? current?.id;
  const [terms, types, classes, exams] = await Promise.all([
    prisma.term.findMany({ include: { academicYear: true }, orderBy: [{ academicYear: { startDate: "desc" } }, { number: "desc" }] }),
    prisma.examType.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.exam.findMany({
      where: { termId, ...(sp(params, "status") ? { status: sp(params, "status") as any } : {}) },
      include: { examType: true, term: { include: { academicYear: true } }, classes: { include: { schoolClass: true } }, _count: { select: { marks: true, results: true } }, components: { include: { componentExam: true } } },
      orderBy: [{ examType: { order: "asc" } }, { createdAt: "asc" }],
    }),
  ]);
  // Teacher's own marks-entry shortcuts
  const mine = user.staffId && can(user, "marks.enter")
    ? await prisma.teacherAllocation.findMany({
        where: { staffId: user.staffId, academicYear: { isCurrent: true } },
        include: { subject: true, stream: { include: { schoolClass: true } } },
        orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { subject: { name: "asc" } }],
      })
    : [];
  const openExams = exams.filter((e) => e.status === "OPEN" && !e.isComposite);
  const submissions = mine.length
    ? await prisma.markSubmission.findMany({ where: { examId: { in: openExams.map((e) => e.id) }, OR: mine.map((a) => ({ streamId: a.streamId, subjectId: a.subjectId })) } })
    : [];
  const singleExams = exams.filter((e) => !e.isComposite);
  return (
    <>
      <PageHeader title="Examinations" description="BOT, MOT, EOT, mock and combined (weighted) examinations." actions={can(user, "exams.manage") && (
        <FormDialog trigger="New examination" title="New examination" action={createExam} wide>
          <TextField label="Name" name="name" required placeholder="Term 3 End of Term Examinations 2026" />
          <Grid cols={2}>
            <SelectField label="Type" name="examTypeId" required options={types.map((t) => ({ value: t.id, label: t.name }))} />
            <SelectField label="Term" name="termId" required defaultValue={current?.id} options={terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }))} />
            <TextField label="Max mark — O-Level (S1–S4)" name="maxMarks" type="number" defaultValue="100" hint="End of term: 80 (activities add 20)" />
            <TextField label="Max mark — A-Level (S5–S6)" name="maxMarksA" type="number" defaultValue="100" hint="No activities of integration" />
            <TextField label="Start date" name="startDate" type="date" />
            <TextField label="End date" name="endDate" type="date" />
          </Grid>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Classes</legend>
            <div className="flex flex-wrap gap-3">{classes.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="classIds[]" value={c.id} />{c.name}</label>)}</div>
          </fieldset>
          <CheckboxField name="autoSubjects" label="Add every subject the students take (recommended)" defaultChecked />
          <CheckboxField name="openNow" label="Open for marks entry now — teachers can enter marks straight away" defaultChecked />
          <details className="rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">Combined exam (examination formula)</summary>
            <p className="my-2 text-xs text-slate-500">e.g. Term final = 20% BOT + 20% MOT + 60% EOT. Marks are calculated from the component exams&apos; percentages; nothing is entered for the combined exam itself.</p>
            <CheckboxField name="isComposite" label="This is a combined exam" />
            <div className="mt-2 space-y-1">
              {singleExams.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <label className="flex flex-1 items-center gap-1.5"><input type="checkbox" name="componentIds[]" value={e.id} />{e.name}</label>
                  <input type="number" name={`weight_${e.id}`} placeholder="weight %" className="h-8 w-24 rounded border border-slate-300 px-2" min="0" step="0.5" />
                </div>
              ))}
              {singleExams.length === 0 && <p className="text-xs text-slate-500">Create the component exams in this term first.</p>}
            </div>
          </details>
        </FormDialog>
      )} />
      {mine.length > 0 && openExams.length > 0 && (
        <Card className="mb-5">
          <CardHeader><CardTitle>My marks entry</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {openExams.map((e) => (
              <div key={e.id}>
                <p className="mb-1 text-sm font-medium">{e.name}</p>
                <div className="flex flex-wrap gap-2">
                  {mine.filter((a) => e.classes.some((c) => c.classId === a.stream.classId)).map((a) => {
                    const st = submissions.find((s) => s.examId === e.id && s.streamId === a.streamId && s.subjectId === a.subjectId)?.status ?? "NOT STARTED";
                    return (
                      <Link key={a.id} href={`/exams/${e.id}/marks?streamId=${a.streamId}&subjectId=${a.subjectId}`} className="rounded border border-slate-200 px-3 py-2 text-sm hover:border-brand-400 hover:bg-brand-50">
                        {a.subject.name} · {a.stream.schoolClass.code} {a.stream.name} <StatusBadge status={st} />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <FilterBar filters={[
        { name: "termId", label: "Term", options: terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` })) },
        { name: "status", label: "Status", options: ["DRAFT", "OPEN", "CLOSED", "PUBLISHED"].map((s) => ({ value: s, label: s })) },
      ]} />
      <Table>
        <THead><tr><TH>Examination</TH><TH>Type</TH><TH>Classes</TH><TH>Dates</TH><TH>Marks</TH><TH>Status</TH>{can(user, "exams.manage") && <TH className="text-right">Actions</TH>}</tr></THead>
        <tbody>
          {exams.map((e) => (
            <TR key={e.id}>
              <TD>
                <Link href={`/exams/${e.id}`} className="font-medium text-brand-800 hover:underline">{e.name}</Link>
                {e.isComposite && <p className="text-xs text-slate-500">Combined: {e.components.map((c) => `${c.componentExam.name} ${Number(c.weight)}%`).join(" + ")}</p>}
              </TD>
              <TD>{e.examType.code}</TD>
              <TD className="text-xs">{e.classes.map((c) => c.schoolClass.code).join(", ")}</TD>
              <TD className="whitespace-nowrap text-xs">{e.startDate ? `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}` : "—"}</TD>
              <TD>{e.isComposite ? <Badge>calculated</Badge> : e._count.marks}</TD>
              <TD><StatusBadge status={e.status} /></TD>
              {can(user, "exams.manage") && (
                <TD className="whitespace-nowrap text-right">
                  <span className="inline-flex gap-1">
                    {!e.isComposite && e.status === "OPEN" && (
                      <ConfirmAction action={setExamStatus} fields={{ examId: e.id, status: "CLOSED" }} label="Close" icon={<Lock className="h-3.5 w-3.5" />}
                        confirm={`Close "${e.name}" for marks entry? Teachers will no longer be able to enter or change marks.`} />
                    )}
                    {!e.isComposite && (e.status === "DRAFT" || e.status === "CLOSED") && (
                      <ConfirmAction action={setExamStatus} fields={{ examId: e.id, status: "OPEN" }} label="Open" variant="success" icon={<LockOpen className="h-3.5 w-3.5" />}
                        confirm={`Open "${e.name}" for marks entry? Teachers can then enter marks for their subjects.`} />
                    )}
                    <ExamEditActions size="sm" exam={{ id: e.id, name: e.name, examTypeId: e.examTypeId, termId: e.termId, startDate: e.startDate, endDate: e.endDate, isComposite: e.isComposite, classIds: e.classes.map((c) => c.classId), marks: e._count.marks, results: e._count.results }}
                      examTypes={types.map((t) => ({ value: t.id, label: t.name }))} terms={terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }))} classes={classes.map((c) => ({ value: c.id, label: c.code }))} />
                  </span>
                </TD>
              )}
            </TR>
          ))}
          {exams.length === 0 && <TR><TD colSpan={7} className="py-6 text-center text-slate-500">No examinations for this term yet.</TD></TR>}
        </tbody>
      </Table>
    </>
  );
}
