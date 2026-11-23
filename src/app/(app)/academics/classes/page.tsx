import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { applyClassSubjectRules, saveClassSubjects } from "@/server/actions/academics";
import { classSubjectStatus } from "@/server/class-subjects";
import { subjectFixes, STATUS_LABEL, type SubjectStatus } from "@/lib/class-subjects";
import { ActionForm, ConfirmAction } from "@/components/forms";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

export const metadata = { title: "Subjects by class" };

const OPTS: SubjectStatus[] = ["COMPULSORY", "OPTIONAL", "NOT_OFFERED"];
const tint: Record<SubjectStatus, string> = { COMPULSORY: "border-brand-300 bg-brand-50 text-brand-900", OPTIONAL: "border-amber-300 bg-amber-50 text-amber-900", NOT_OFFERED: "border-slate-200 bg-slate-100 text-slate-500" };

/**
 * Subjects by class (O-Level): for each subject, whether it is compulsory, optional or not offered in S1, S2, S3 and S4.
 * Registration and promotion give students the compulsory subjects of their class; Bulk edit offers the optional ones.
 */
export default async function ClassSubjectsPage() {
  const user = await requirePage("academics.view");
  const manage = can(user, "academics.manage");
  const [classes, subjects, year] = await Promise.all([
    prisma.schoolClass.findMany({ where: { level: "O_LEVEL", isActive: true }, orderBy: { order: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.subject.findMany({ where: { level: "O_LEVEL", isActive: true }, orderBy: [{ category: "asc" }, { reportOrder: "asc" }, { name: "asc" }] }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
  ]);
  const statusOf = new Map<string, Map<string, SubjectStatus>>();
  for (const c of classes) statusOf.set(c.id, (await classSubjectStatus(prisma, c.id)).status);

  // Students whose subjects this year don't follow the settings (missing a compulsory subject, or taking one not offered).
  const off = new Map<string, { students: number; add: number; remove: number }>();
  if (year) {
    const students = await prisma.student.findMany({
      where: { status: "ACTIVE", classId: { in: classes.map((c) => c.id) } },
      select: { classId: true, subjects: { where: { academicYearId: year.id }, select: { subjectId: true } }, marks: { where: { exam: { term: { academicYearId: year.id } } }, select: { subjectId: true } } },
    });
    for (const s of students) {
      const f = subjectFixes(s.subjects.map((x) => x.subjectId), statusOf.get(s.classId)!, new Set(s.marks.map((m) => m.subjectId)));
      if (!f.add.length && !f.remove.length) continue;
      const o = off.get(s.classId) ?? { students: 0, add: 0, remove: 0 };
      o.students++; o.add += f.add.length; o.remove += f.remove.length; off.set(s.classId, o);
    }
  }
  const totalOff = [...off.values()].reduce((a, o) => a + o.students, 0);
  const count = (c: string, st: SubjectStatus) => [...(statusOf.get(c)?.values() ?? [])].filter((x) => x === st).length;

  return (
    <div className="space-y-5">
      <Alert>
        Set how each O-Level subject is taken in each class — for example a subject <b>compulsory in S1 and S2</b> and <b>optional in S3 and S4</b>.
        New and promoted students get the <b>compulsory</b> subjects of their class; the <b>optional</b> ones are chosen per student in
        {" "}<Link className="underline" href="/students/bulk">Students → Bulk edit</Link> or on the profile. <b>Not offered</b> subjects cannot be given in that class.
        A-Level subjects follow the combinations.
      </Alert>

      {totalOff > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-800">{totalOff} student(s) don&apos;t match these settings yet{year ? ` (${year.name})` : ""}</CardTitle>
            {manage && <ConfirmAction action={applyClassSubjectRules} fields={{}} label="Update students' subjects" variant="default" confirm="Give every O-Level student the compulsory subjects of their class and remove subjects not offered in their class (subjects that already have marks are kept)? Optional subjects are not changed." />}
          </CardHeader>
          <CardContent className="text-sm text-slate-700">
            {classes.filter((c) => off.has(c.id)).map((c) => {
              const o = off.get(c.id)!;
              return <p key={c.id}><b>{c.name}:</b> {o.students} student(s) — {o.add} compulsory subject(s) missing{o.remove ? `, ${o.remove} not-offered subject(s) to remove` : ""}.</p>;
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Subjects by class (O-Level)</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveClassSubjects} submitLabel="Save subjects by class" hideSubmit={!manage}>
            <Table>
              <THead>
                <tr>
                  <TH>Subject</TH>
                  {classes.map((c) => <TH key={c.id} className="text-center">{c.name}<span className="block text-[10px] font-normal normal-case text-slate-500">{count(c.id, "COMPULSORY")} compulsory · {count(c.id, "OPTIONAL")} optional</span></TH>)}
                </tr>
              </THead>
              <tbody>
                {subjects.map((sub) => (
                  <TR key={sub.id}>
                    <TD className="font-medium">{sub.name}<span className="block text-xs font-normal text-slate-500">{sub.code}</span></TD>
                    {classes.map((c) => {
                      const st = statusOf.get(c.id)!.get(sub.id) ?? "OPTIONAL";
                      return (
                        <TD key={c.id} className="text-center">
                          {manage ? (
                            <select aria-label={`${sub.name} in ${c.name}`} name={`r_${c.id}_${sub.id}`} defaultValue={st} className={`h-8 rounded border px-1 text-xs ${tint[st]}`}>
                              {OPTS.map((o) => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
                            </select>
                          ) : <span className={`rounded border px-2 py-0.5 text-xs ${tint[st]}`}>{STATUS_LABEL[st]}</span>}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </tbody>
            </Table>
            {manage && <p className="text-xs text-slate-500">Saving changes the settings only. Students already registered keep their subjects until you press <b>Update students&apos; subjects</b> (shown above when any student doesn&apos;t match).</p>}
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
