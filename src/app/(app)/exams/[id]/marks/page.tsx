import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { canEnterMarks } from "@/server/exams/marks";
import { saveMarksAction, submitMarks } from "@/server/actions/exams";
import { uploadImport } from "@/server/actions/imports";
import { MarksGrid } from "@/components/marks-grid";
import { ActionForm, ConfirmAction, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Marks entry" };

export default async function MarksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("marks.enter", "marks.enter.any", "marks.approve");
  const { id } = await params;
  const q = await searchParams;
  const streamId = sp(q, "streamId");
  const subjectId = sp(q, "subjectId");
  const correctionRequested = sp(q, "correct") === "1";
  if (!streamId || !subjectId) notFound();
  const [exam, stream, subject] = await Promise.all([
    prisma.exam.findUnique({ where: { id }, include: { term: true } }),
    prisma.stream.findUnique({ where: { id: streamId }, include: { schoolClass: true } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
  ]);
  if (!exam || !stream || !subject) notFound();
  const es = await prisma.examSubject.findUnique({ where: { examId_classId_subjectId: { examId: id, classId: stream.classId, subjectId } } });
  if (!es) return <Alert tone="error">{subject.name} is not part of this exam for {stream.schoolClass.name}.</Alert>;
  const allowed = await canEnterMarks(prisma, user, streamId, subjectId, exam.term.academicYearId);
  const approver = can(user, "marks.approve");
  if (!allowed && !approver) return <Alert tone="error">You are not allocated to teach {subject.name} in {stream.schoolClass.code} {stream.name}.</Alert>;
  const sub = await prisma.markSubmission.findUnique({ where: { examId_streamId_subjectId: { examId: id, streamId, subjectId } } });
  const students = await prisma.student.findMany({
    where: { streamId, OR: [{ status: "ACTIVE" }, { marks: { some: { examId: id, subjectId } } }], subjects: { some: { subjectId, academicYearId: exam.term.academicYearId } } },
    include: { marks: { where: { examId: id, subjectId } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const locked = sub?.status === "SUBMITTED" || sub?.status === "APPROVED";
  const examOpen = exam.status === "OPEN";
  const correction = approver && correctionRequested && (locked || exam.status === "CLOSED" || exam.status === "PUBLISHED");
  const editable = !exam.isComposite && ((examOpen && !locked && allowed) || correction);
  const rows = students.map((s) => {
    const m = s.marks[0];
    return { id: s.id, admissionNo: s.admissionNo, name: studentName(s), value: !m ? "" : m.status === "PRESENT" ? String(Number(m.score)) : m.status === "ABSENT" ? "ABS" : "EX" };
  });
  const ctx = `examId=${id}&streamId=${streamId}&subjectId=${subjectId}`;
  return (
    <>
      <PageHeader
        title={`${subject.name} — ${stream.schoolClass.code} ${stream.name}`}
        description={`${exam.name} · maximum ${Number(es.maxMarks)} marks · ${students.length} students take this subject`}
        actions={<><StatusBadge status={sub?.status ?? "NOT STARTED"} /><Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button></>}
      />
      {sub?.status === "REJECTED" && <Alert tone="warn" className="mb-3">Returned for correction: {sub.reviewNote}</Alert>}
      {!examOpen && !correction && <Alert className="mb-3">Marks entry is {exam.status === "DRAFT" ? "not open yet" : "closed"} for this examination.</Alert>}
      {locked && !correction && <Alert className="mb-3">These marks are {sub!.status.toLowerCase()} and locked.{approver && <> <Link className="underline" href={`?streamId=${streamId}&subjectId=${subjectId}&correct=1`}>Correct marks</Link></>}</Alert>}
      {correction && <Alert tone="warn" className="mb-3">Correction mode: every change is recorded with your reason. <Link className="underline" href={`?streamId=${streamId}&subjectId=${subjectId}`}>Exit</Link></Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MarksGrid
            action={saveMarksAction}
            rows={rows}
            max={Number(es.maxMarks)}
            readOnly={!editable}
            correction={correction}
            hidden={{ examId: id, streamId, subjectId, ...(correction ? { correction: "true" } : {}) }}
          />
        </div>
        <div className="space-y-5">
          {editable && !correction && (
            <Card>
              <CardHeader><CardTitle>Submit for approval</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>Save first. Every student needs a mark, ABS or EX. After submission the marks are locked until the DOS approves or returns them.</p>
                <ConfirmAction action={submitMarks} fields={{ examId: id, streamId, subjectId }} label="Submit marks" variant="success" size="default" confirm="Submit these marks for approval? You will not be able to edit them afterwards." />
              </CardContent>
            </Card>
          )}
          {editable && !correction && (
            <Card>
              <CardHeader><CardTitle>Import from Excel</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" size="sm"><a href={`/api/templates/marks?${ctx}`}><Download />Download pre-filled template</a></Button>
                <ActionForm action={uploadImport} submitLabel="Upload and check" refresh={false}>
                  <input type="hidden" name="kind" value="marks" />
                  <input type="hidden" name="examId" value={id} />
                  <input type="hidden" name="streamId" value={streamId} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <TextField label="Completed template (.xlsx)" name="file" type="file" accept=".xlsx" required />
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
