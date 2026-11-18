import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { addActivity, deleteActivity, renameActivity, saveActivityScores } from "@/server/actions/activities";
import { ActivityGrid } from "@/components/activity-grid";
import { ConfirmAction, FormDialog, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { DEFAULT_ACTIVITY_BANDS, type Band } from "@/lib/cbc";
import { studentName } from "@/lib/utils";

export const metadata = { title: "Activities of Integration" };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("marks.enter", "marks.enter.any");
  const params = await searchParams;
  const elevated = can(user, "marks.enter.any", "marks.approve");
  const terms = await prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } });
  const term = terms.find((t) => t.id === sp(params, "termId")) ?? terms.find((t) => t.isCurrent) ?? terms[0];
  if (!term) return <Alert>Set up academic terms first.</Alert>;

  // What this user may open: their allocations (O-Level only), or everything for the DOS.
  const allocations = elevated
    ? (await prisma.stream.findMany({ where: { isActive: true, schoolClass: { level: "O_LEVEL" } }, include: { schoolClass: true }, orderBy: [{ schoolClass: { order: "asc" } }, { name: "asc" }] }))
        .map((s) => ({ streamId: s.id, label: `${s.schoolClass.code} ${s.name}`, classId: s.classId }))
    : (await prisma.teacherAllocation.findMany({
        where: { staffId: user.staffId ?? "-", academicYearId: term.academicYearId, stream: { schoolClass: { level: "O_LEVEL" } } },
        include: { stream: { include: { schoolClass: true } } }, distinct: ["streamId"],
      })).map((a) => ({ streamId: a.streamId, label: `${a.stream.schoolClass.code} ${a.stream.name}`, classId: a.stream.classId }));
  const streamId = sp(params, "streamId") ?? allocations[0]?.streamId;
  const sel = allocations.find((a) => a.streamId === streamId);

  const subjects = sel
    ? elevated
      ? await prisma.subject.findMany({ where: { level: "O_LEVEL", isActive: true }, orderBy: { name: "asc" } })
      : (await prisma.teacherAllocation.findMany({ where: { staffId: user.staffId ?? "-", streamId: sel.streamId, academicYearId: term.academicYearId }, include: { subject: true } })).map((a) => a.subject)
    : [];
  const subjectId = sp(params, "subjectId") ?? subjects[0]?.id;
  const subject = subjects.find((s) => s.id === subjectId);

  const header = (
    <>
      <PageHeader title="Activities of Integration" description="Continuous assessment for the competency-based curriculum: score each chapter/theme out of 3 and add a competency remark. On the end-of-term report the average becomes a mark out of 20, added to the EOT paper out of 80." />
      <FilterBar filters={[
        { name: "termId", label: "Term", allowAll: false, value: term.id, options: terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` })) },
        { name: "streamId", label: "Stream", allowAll: false, value: streamId, options: allocations.map((a) => ({ value: a.streamId, label: a.label })) },
        { name: "subjectId", label: "Subject", allowAll: false, value: subjectId, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
      ]} />
    </>
  );
  if (!sel) return <>{header}<Alert>You are not allocated to any O-Level stream this year.</Alert></>;
  if (!subject) return <>{header}<Alert>Choose a subject.</Alert></>;

  const [activities, students, scale] = await Promise.all([
    prisma.learningActivity.findMany({ where: { termId: term.id, classId: sel.classId, subjectId: subject.id }, orderBy: { order: "asc" }, include: { _count: { select: { scores: true } } } }),
    prisma.student.findMany({
      where: { streamId: sel.streamId, status: "ACTIVE", subjects: { some: { subjectId: subject.id, academicYearId: term.academicYearId } } },
      include: { activityScores: { where: { activity: { termId: term.id, subjectId: subject.id } } }, competencyRemarks: { where: { termId: term.id, subjectId: subject.id } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ACTIVITY", isDefault: true }, include: { bands: true } }),
  ]);
  const bands: Band[] = scale ? scale.bands.map((b) => ({ grade: b.grade, minScore: Number(b.minScore), maxScore: Number(b.maxScore), remark: b.remark, description: b.description })) : DEFAULT_ACTIVITY_BANDS;
  const readOnly = !term.isCurrent && !elevated;

  return (
    <>
      {header}
      {readOnly && <Alert className="mb-3">{term.name} is closed. Only the Director of Studies can change these scores.</Alert>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Chapters / themes for {sel.label.split(" ")[0]} {subject.name} ({activities.length}):</span>
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
            <input type="hidden" name="classId" value={sel.classId} />
            <input type="hidden" name="subjectId" value={subject.id} />
            <TextField label="Chapter / theme" name="title" required placeholder="e.g. Drama, Data collection, Weather and climate" hint="Applies to every stream of this class." />
          </FormDialog>
        )}
      </div>
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
          hidden={{ termId: term.id, streamId: sel.streamId, subjectId: subject.id }}
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
