import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { can, type CurrentUser } from "@/server/auth";
import { canEnterMarks } from "@/server/exams/marks";
import { marksApprovalRequired } from "@/server/exams/approval-setting";
import { saveMarksAction, submitMarks } from "@/server/actions/exams";
import { uploadImport } from "@/server/actions/imports";
import { MarksGrid } from "@/components/marks-grid";
import { ActionForm, ConfirmAction, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { studentName } from "@/lib/utils";

/**
 * The marks sheet for one exam × stream × subject: entry grid, submit and Excel import.
 * Used by the exam's marks page and by Enter Scores → End of term scores.
 * `selfHref` is the current page URL (with query) used to build the correction links.
 */
export async function MarksSheet({
  user, examId, streamId, subjectId, paper: paperRequested, correctionRequested, selfHref, showHeader = true,
}: {
  user: CurrentUser; examId: string; streamId: string; subjectId: string; paper?: number; correctionRequested: boolean; selfHref: string; showHeader?: boolean;
}) {
  const [exam, stream, subject] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId }, include: { term: true } }),
    prisma.stream.findUnique({ where: { id: streamId }, include: { schoolClass: true } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
  ]);
  if (!exam || !stream || !subject) return <Alert tone="error">Examination, stream or subject not found.</Alert>;
  // Subjects with several papers (A-Level principals: P/1, P/2) — marks are entered one paper at a time.
  const papers = subject.paperCount;
  const paper = paperRequested && paperRequested >= 1 && paperRequested <= papers ? paperRequested : 1;
  const es = await prisma.examSubject.findUnique({ where: { examId_classId_subjectId: { examId, classId: stream.classId, subjectId } } });
  if (!es) return <Alert tone="error">{subject.name} is not part of {exam.name} for {stream.schoolClass.name}. Ask the Director of Studies to add it.</Alert>;
  const allowed = await canEnterMarks(prisma, user, streamId, subjectId, exam.term.academicYearId);
  const approver = can(user, "marks.approve");
  if (!allowed && !approver) return <Alert tone="error">You are not allocated to teach {subject.name} in {stream.schoolClass.code} {stream.name}.</Alert>;
  const [sub, needsApproval] = await Promise.all([
    prisma.markSubmission.findUnique({ where: { examId_streamId_subjectId: { examId, streamId, subjectId } } }),
    marksApprovalRequired(),
  ]);
  const students = await prisma.student.findMany({
    where: { streamId, OR: [{ status: "ACTIVE" }, { marks: { some: { examId, subjectId } } }], subjects: { some: { subjectId, academicYearId: exam.term.academicYearId } } },
    include: { marks: { where: { examId, subjectId, paper: { lte: papers } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const locked = needsApproval && (sub?.status === "SUBMITTED" || sub?.status === "APPROVED");
  // Exams are always open for marks entry; "correction" is only for sheets locked by DOS approval (when switched on).
  const correction = approver && correctionRequested && locked;
  const enteredAll = students.reduce((a, s) => a + s.marks.length, 0);
  const editable = !exam.isComposite && ((!locked && allowed) || correction);
  const rows = students.map((s) => {
    const m = s.marks.find((x) => x.paper === paper);
    return { id: s.id, admissionNo: s.admissionNo, name: studentName(s), value: !m ? "" : m.status === "PRESENT" ? String(Number(m.score)) : m.status === "ABSENT" ? "ABS" : "EX" };
  });
  const ctx = `examId=${examId}&streamId=${streamId}&subjectId=${subjectId}&paper=${paper}`;
  const base = selfHref.replace(/[?&](correct|paper)=[^&]*/g, "");
  const paperHref = (n: number) => (papers > 1 ? `${base}${base.includes("?") ? "&" : "?"}paper=${n}` : base);
  const exitHref = paperHref(paper);
  const sep = exitHref.includes("?") ? "&" : "?";
  const label = (n: number) => `${subject.category === "SUBSIDIARY" ? "S" : "P"}/${n}`;

  return (
    <>
      {showHeader ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{subject.name} — {stream.schoolClass.code} {stream.name}</h2>
            <p className="text-sm text-slate-600">{exam.name} · maximum {Number(es.maxMarks)} marks{papers > 1 ? " per paper" : ""} · {students.length} students take this subject</p>
          </div>
          {needsApproval ? <StatusBadge status={sub?.status ?? "NOT STARTED"} /> : <StatusBadge status={enteredAll === 0 ? "NOT STARTED" : enteredAll < students.length * papers ? "IN_PROGRESS" : "COMPLETE"} />}
        </div>
      ) : null}
      {papers > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="paper-tabs">
          <span className="text-sm font-medium text-slate-700">{subject.name} has {papers} papers — enter marks for:</span>
          {Array.from({ length: papers }, (_, i) => i + 1).map((n) => {
            const done = students.filter((s) => s.marks.some((m) => m.paper === n)).length;
            return (
              <Button key={n} asChild size="sm" variant={n === paper ? "default" : "outline"}>
                <Link href={paperHref(n)}>Paper {n} ({label(n)}) · {done}/{students.length}</Link>
              </Button>
            );
          })}
        </div>
      )}
      {needsApproval && sub?.status === "REJECTED" && <Alert tone="warn" className="mb-3">Returned for correction: {sub.reviewNote}</Alert>}
      {locked && !correction && <Alert className="mb-3">These marks are {sub!.status.toLowerCase()} and locked.{approver && <> <Link className="underline" href={`${exitHref}${sep}correct=1`}>Correct marks</Link></>}</Alert>}
      {correction && <Alert tone="warn" className="mb-3">Correction mode: every change is recorded with your reason. <Link className="underline" href={exitHref}>Exit</Link></Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MarksGrid
            key={paper}
            action={saveMarksAction}
            rows={rows}
            max={Number(es.maxMarks)}
            readOnly={!editable}
            correction={correction}
            hidden={{ examId, streamId, subjectId, paper: String(paper), ...(correction ? { correction: "true" } : {}) }}
          />
        </div>
        <div className="space-y-5">
          {editable && !correction && !needsApproval && (
            <Card>
              <CardHeader><CardTitle>Saved marks count straight away</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600">
                Every mark you save goes onto the report cards. You can keep correcting them at any time.
              </CardContent>
            </Card>
          )}
          {editable && !correction && needsApproval && (
            <Card>
              <CardHeader><CardTitle>Submit for approval</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <p>Save first. Every student needs a mark, ABS or EX. After submission the marks are locked until the DOS approves or returns them.</p>
                <ConfirmAction action={submitMarks} fields={{ examId, streamId, subjectId }} label="Submit marks" variant="success" size="default" confirm="Submit these marks for approval? You will not be able to edit them afterwards." />
              </CardContent>
            </Card>
          )}
          {editable && !correction && (
            <Card>
              <CardHeader><CardTitle>Import from Excel{papers > 1 ? ` — paper ${paper}` : ""}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" size="sm"><a href={`/api/templates/marks?${ctx}`}><Download />Download pre-filled template</a></Button>
                <ActionForm action={uploadImport} submitLabel="Upload and check" refresh={false}>
                  <input type="hidden" name="kind" value="marks" />
                  <input type="hidden" name="examId" value={examId} />
                  <input type="hidden" name="streamId" value={streamId} />
                  <input type="hidden" name="subjectId" value={subjectId} />
                  <input type="hidden" name="paper" value={paper} />
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
