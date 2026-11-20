import { prisma } from "@/lib/db";
import { addActivity, deleteActivity, renameActivity, saveActivityScores } from "@/server/actions/activities";
import { ActivityGrid } from "@/components/activity-grid";
import { ActionForm, ConfirmAction, FormDialog, TextField } from "@/components/forms";
import { uploadImport } from "@/server/actions/imports";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { DEFAULT_ACTIVITY_BANDS, type Band } from "@/lib/cbc";
import { studentName } from "@/lib/utils";

/** Activities of Integration (chapters scored out of 3) for one term × stream × subject. Access is checked by the caller and again in the actions. */
export async function ActivitySheet({
  term, stream, subject, elevated,
}: {
  term: { id: string; name: string; isCurrent: boolean; academicYearId: string };
  stream: { id: string; classId: string; label: string };
  subject: { id: string; name: string };
  elevated: boolean;
}) {
  const [activities, students, scale] = await Promise.all([
    prisma.learningActivity.findMany({ where: { termId: term.id, classId: stream.classId, subjectId: subject.id }, orderBy: { order: "asc" }, include: { _count: { select: { scores: true } } } }),
    prisma.student.findMany({
      where: { streamId: stream.id, status: "ACTIVE", subjects: { some: { subjectId: subject.id, academicYearId: term.academicYearId } } },
      include: { activityScores: { where: { activity: { termId: term.id, subjectId: subject.id } } }, competencyRemarks: { where: { termId: term.id, subjectId: subject.id } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ACTIVITY", isDefault: true }, include: { bands: true } }),
  ]);
  const bands: Band[] = scale ? scale.bands.map((b) => ({ grade: b.grade, minScore: Number(b.minScore), maxScore: Number(b.maxScore), remark: b.remark, description: b.description })) : DEFAULT_ACTIVITY_BANDS;
  const readOnly = !term.isCurrent && !elevated;

  return (
    <>
      {readOnly && <Alert className="mb-3">{term.name} is closed. Only the Director of Studies can change these scores.</Alert>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Chapters / themes for {stream.label.split(" ")[0]} {subject.name} ({activities.length}):</span>
        {activities.map((a, i) => (
          <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs">
            {i + 1}. {a.title}
            {!readOnly && (
              <>
                <FormDialog trigger="✎" title="Rename chapter" action={renameActivity} triggerVariant="ghost" triggerSize="sm">
                  <input type="hidden" name="id" value={a.id} /><TextField label="Chapter / theme" name="title" defaultValue={a.title} required />
                </FormDialog>
                <ConfirmAction action={deleteActivity} fields={{ id: a.id }} label="×" variant="ghost" confirm={`Remove "${a.title}"${a._count.scores ? ` and its ${a._count.scores} score(s)` : ""}?`} />
              </>
            )}
          </span>
        ))}
        {!readOnly && (
          <FormDialog trigger="+ Add chapter / theme" title={`New chapter — ${subject.name}`} action={addActivity} triggerVariant="secondary" triggerSize="sm">
            <input type="hidden" name="termId" value={term.id} />
            <input type="hidden" name="classId" value={stream.classId} />
            <input type="hidden" name="subjectId" value={subject.id} />
            <TextField label="Chapter / theme" name="title" required placeholder="e.g. Drama, Data collection, Weather and climate" hint="Applies to every stream of this class." />
          </FormDialog>
        )}
      </div>
      {!readOnly && activities.length > 0 && students.length > 0 && (
        <details className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Enter scores in Excel instead</summary>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">1. Download the template — learners and chapters are filled in, with any scores already saved.</p>
              <Button asChild variant="outline" size="sm"><a href={`/api/templates/activities?termId=${term.id}&streamId=${stream.id}&subjectId=${subject.id}`}><Download />Download pre-filled template</a></Button>
            </div>
            <div className="min-w-[260px] flex-1 space-y-1">
              <p className="text-xs text-slate-500">2. Fill scores out of 3 (blank = keep), save, then upload. You will see a check before anything is saved.</p>
              <ActionForm action={uploadImport} submitLabel="Upload and check" refresh={false}>
                <input type="hidden" name="kind" value="activities" />
                <input type="hidden" name="termId" value={term.id} />
                <input type="hidden" name="streamId" value={stream.id} />
                <input type="hidden" name="subjectId" value={subject.id} />
                <TextField label="Completed template (.xlsx)" name="file" type="file" accept=".xlsx" required />
              </ActionForm>
            </div>
          </div>
        </details>
      )}
      {activities.length === 0 ? (
        <Alert>Add the chapter(s) or theme(s) assessed this term to start entering scores.</Alert>
      ) : students.length === 0 ? (
        <Alert>No active learners in this stream take {subject.name}.</Alert>
      ) : (
        <ActivityGrid
          action={saveActivityScores}
          activities={activities.map((a) => ({ id: a.id, title: a.title }))}
          bands={bands}
          readOnly={readOnly}
          hidden={{ termId: term.id, streamId: stream.id, subjectId: subject.id }}
          rows={students.map((s) => ({
            id: s.id, admissionNo: s.admissionNo, name: studentName(s),
            scores: Object.fromEntries(s.activityScores.map((x) => [x.activityId, String(Number(x.score))])),
            remark: s.competencyRemarks[0]?.remark ?? "",
          }))}
        />
      )}
    </>
  );
}
