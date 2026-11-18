import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { deleteLearningItem, saveAssignment, saveMaterial } from "@/server/actions/communication";
import { ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Assignments & materials" };

export default async function LearningPage() {
  const user = await requirePage("learning.manage");
  const all = can(user, "academics.manage");
  const allocs = user.staffId ? await prisma.teacherAllocation.findMany({ where: { staffId: user.staffId, academicYear: { isCurrent: true } }, include: { subject: true, stream: { include: { schoolClass: true } } } }) : [];
  const [streams, subjects, classes] = all
    ? await Promise.all([prisma.stream.findMany({ include: { schoolClass: true }, orderBy: [{ schoolClass: { order: "asc" } }, { name: "asc" }] }), prisma.subject.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), prisma.schoolClass.findMany({ orderBy: { order: "asc" } })])
    : [allocs.map((a) => a.stream), allocs.map((a) => a.subject), allocs.map((a) => a.stream.schoolClass)];
  const uniq = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()];
  const mineFilter = all ? {} : { createdById: user.id };
  const [assignments, materials] = await Promise.all([
    prisma.assignment.findMany({ where: mineFilter, include: { subject: true, stream: { include: { schoolClass: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.learningMaterial.findMany({ where: mineFilter, include: { subject: true, schoolClass: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const streamOpts = uniq(streams).map((s) => ({ value: s.id, label: `${s.schoolClass.code} ${s.name}` }));
  const subjectOpts = uniq(subjects).map((s) => ({ value: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Assignments & learning materials" description="Published items appear in the student portal for the stream or class." actions={
        <>
          <FormDialog trigger="New assignment" title="New assignment" action={saveAssignment} wide>
            <Grid><SelectField label="Stream" name="streamId" required options={streamOpts} /><SelectField label="Subject" name="subjectId" required options={subjectOpts} /></Grid>
            <TextField label="Title" name="title" required />
            <TextAreaField label="Instructions" name="description" rows={5} required />
            <Grid><TextField label="Due date" name="dueDate" type="date" /><TextField label="Attachment (PDF/image)" name="file" type="file" accept="application/pdf,image/*" /></Grid>
          </FormDialog>
          <FormDialog trigger="New material" title="New learning material" action={saveMaterial} triggerVariant="secondary" wide>
            <Grid><SelectField label="Class" name="classId" required options={uniq(classes).map((c) => ({ value: c.id, label: c.name }))} /><SelectField label="Subject" name="subjectId" required options={subjectOpts} /></Grid>
            <TextField label="Title" name="title" required />
            <TextAreaField label="Description" name="description" rows={3} />
            <Grid><TextField label="Link (https://…)" name="url" /><TextField label="or file (PDF/image, max 4 MB)" name="file" type="file" accept="application/pdf,image/*" /></Grid>
          </FormDialog>
        </>
      } />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {assignments.map((a) => (
              <div key={a.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex justify-between gap-2"><p className="font-medium">{a.title}</p><ConfirmAction action={deleteLearningItem} fields={{ id: a.id, kind: "assignment" }} label="Remove" confirm="Remove this assignment?" /></div>
                <p className="text-xs text-slate-500">{a.subject.name} · {a.stream.schoolClass.code} {a.stream.name}{a.dueDate ? ` · due ${fmtDate(a.dueDate)}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.description}</p>
                {a.fileId && <a className="text-xs text-brand-700 underline" href={`/api/files/${a.fileId}`} target="_blank">Attachment</a>}
              </div>
            ))}
            {assignments.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Learning materials</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {materials.map((m) => (
              <div key={m.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex justify-between gap-2"><p className="font-medium">{m.title}</p><ConfirmAction action={deleteLearningItem} fields={{ id: m.id, kind: "material" }} label="Remove" confirm="Remove this material?" /></div>
                <p className="text-xs text-slate-500">{m.subject.name} · {m.schoolClass.name}</p>
                {m.description && <p className="mt-1 text-slate-700">{m.description}</p>}
                {m.fileId && <a className="text-xs text-brand-700 underline" href={`/api/files/${m.fileId}`} target="_blank">Open file</a>} {m.url && <a className="text-xs text-brand-700 underline" href={m.url} target="_blank" rel="noopener noreferrer">Open link</a>}
              </div>
            ))}
            {materials.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
