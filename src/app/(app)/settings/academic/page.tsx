import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { copyTeacherAllocations, createAcademicYearWithTerms, deleteAcademicYear, saveAcademicYear, saveTerm, setCurrentTerm } from "@/server/actions/settings";
import { ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSwitcher } from "@/components/period-switcher";
import { nextYearName, suggestTerms } from "@/lib/academic-year";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate } from "@/lib/utils";

export default async function AcademicSettings() {
  await requirePage("settings.manage");
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" }, include: { terms: { orderBy: { number: "asc" } } } });
  const yearOpts = years.map((y) => ({ value: y.id, label: y.name }));
  const currentYear = years.find((y) => y.isCurrent);
  const currentTerm = currentYear?.terms.find((t) => t.isCurrent) ?? null;
  // Readiness of each year: what must exist before the school works in it.
  const activeStudents = await prisma.student.count({ where: { status: "ACTIVE" } });
  const readiness = await Promise.all(years.map(async (y) => {
    const [enrolled, withSubjects, allocations, feeStructures, exams] = await Promise.all([
      prisma.enrollment.count({ where: { academicYearId: y.id, student: { status: "ACTIVE" } } }),
      prisma.student.count({ where: { status: "ACTIVE", subjects: { some: { academicYearId: y.id } } } }),
      prisma.teacherAllocation.count({ where: { academicYearId: y.id } }),
      prisma.feeStructure.count({ where: { term: { academicYearId: y.id } } }),
      prisma.exam.count({ where: { term: { academicYearId: y.id } } }),
    ]);
    const warnings: string[] = [];
    if (y.terms.length < 3) warnings.push(`${y.name} has ${y.terms.length} of 3 terms`);
    if (activeStudents && enrolled < activeStudents) warnings.push(`${activeStudents - enrolled} of ${activeStudents} active students are not enrolled in ${y.name} yet (promote them first)`);
    if (activeStudents && withSubjects < activeStudents) warnings.push(`${activeStudents - withSubjects} students have no ${y.name} subjects`);
    if (!allocations) warnings.push(`no teacher allocations for ${y.name} (teachers could not enter marks)`);
    return { y, enrolled, withSubjects, allocations, feeStructures, exams, warnings };
  }));
  const latest = years[0];
  const newName = latest ? nextYearName(latest.name) : String(new Date().getFullYear());
  const newYearNo = Number(newName.slice(0, 4)) || new Date().getFullYear() + 1;
  const suggested = suggestTerms(latest ? latest.terms.map((t) => ({ number: t.number, startDate: isoDate(t.startDate)!, endDate: isoDate(t.endDate)! })) : [], newYearNo);
  const dates = (d: Date) => fmtDate(d, { day: "2-digit", month: "short" });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            Current year and term
            <span className="mt-1 block text-2xl font-bold text-brand-800">{currentYear && currentTerm ? `${currentYear.name} · ${currentTerm.name}` : "Not set"}</span>
            {currentTerm && <span className="block text-xs font-normal text-slate-500">{fmtDate(currentTerm.startDate)} to {fmtDate(currentTerm.endDate)}{currentTerm.nextTermStart ? ` · next term begins ${fmtDate(currentTerm.nextTermStart)}` : ""}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm text-slate-600">Everything works in the current year and term: marks and activity scores, attendance, subjects and teacher allocations, fees and report-card dates. Switch when a new term or year begins (you can switch back at any time).</p>
            {years.length ? (
              <PeriodSwitcher
                action={setCurrentTerm}
                currentTermId={currentTerm?.id ?? null}
                years={readiness.map(({ y, warnings }) => ({ id: y.id, name: y.name, warnings, terms: y.terms.map((t) => ({ id: t.id, name: t.name, isCurrent: t.isCurrent, dates: `${dates(t.startDate)} – ${dates(t.endDate)}` })) }))}
              />
            ) : <Alert tone="warn">Create the academic year and its terms first.</Alert>}
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="mb-1 font-semibold">Moving to a new year (e.g. {currentYear ? nextYearName(currentYear.name) || "next year" : "next year"})</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-700">
              <li><b>New academic year</b> (below) — creates the year with Terms 1–3, and can copy this year&apos;s teacher allocations.</li>
              <li>While the old year is still current, <b>promote</b> each class (Students → Promote) into the new year — this moves students up and gives them the new year&apos;s subjects.</li>
              <li>Check the new year&apos;s teacher allocations (Classes &amp; Subjects → Allocation grid) and fees structures.</li>
              <li><b>Switch</b> to the new year&apos;s Term 1 here. Then create its first examination.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Years at a glance</CardTitle>
          <span className="flex flex-wrap gap-2">
            <FormDialog trigger="New academic year" title="New academic year with its terms" action={createAcademicYearWithTerms} wide submitLabel="Create year">
              <Grid cols={3}>
                <TextField label="Year name" name="name" defaultValue={newName} placeholder="2027" required />
                <TextField label="Year starts" name="startDate" type="date" defaultValue={`${newYearNo}-01-01`} required />
                <TextField label="Year ends" name="endDate" type="date" defaultValue={`${newYearNo}-12-31`} required />
              </Grid>
              <p className="text-xs text-slate-500">Term dates are suggested from {latest ? latest.name : "the usual calendar"} — change them to the Ministry&apos;s calendar. &quot;Next term begins&quot; (printed on report cards) is filled in from the following term.</p>
              {suggested.map((t) => (
                <Grid key={t.number}>
                  <TextField label={`Term ${t.number} opens`} name={`t${t.number}Start`} type="date" defaultValue={t.startDate} required />
                  <TextField label={`Term ${t.number} closes`} name={`t${t.number}End`} type="date" defaultValue={t.endDate} required />
                </Grid>
              ))}
              <SelectField label="Teacher allocations" name="copyAllocationsFrom" defaultValue={currentYear?.id ?? ""} placeholder="Do not copy (allocate afresh)" options={readiness.filter((r) => r.allocations).map((r) => ({ value: r.y.id, label: `Copy from ${r.y.name} (${r.allocations})` }))} hint="Teachers keep the same subjects and streams; change any in the Allocation grid afterwards." />
            </FormDialog>
            {years.length > 1 && (
              <FormDialog trigger="Copy teacher allocations" title="Copy teacher allocations between years" action={copyTeacherAllocations} triggerVariant="outline">
                <Grid>
                  <SelectField label="From" name="fromYearId" required defaultValue={currentYear?.id} options={yearOpts} />
                  <SelectField label="To" name="toYearId" required defaultValue={years.find((y) => !y.isCurrent)?.id} options={yearOpts} />
                </Grid>
                <p className="text-xs text-slate-500">Allocations already in the target year are kept; staff who have left are skipped.</p>
              </FormDialog>
            )}
            <FormDialog trigger="Add a single term" title="New term" action={saveTerm} triggerVariant="outline">
              <TermFields yearOpts={yearOpts} />
            </FormDialog>
          </span>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><tr><TH>Year</TH><TH>Terms</TH><TH className="text-right">Students enrolled</TH><TH className="text-right">With subjects</TH><TH className="text-right">Teacher allocations</TH><TH className="text-right">Fee structures</TH><TH className="text-right">Exams</TH><TH>Ready?</TH></tr></THead>
            <tbody>
              {readiness.map((r) => (
                <TR key={r.y.id}>
                  <TD className="font-medium">{r.y.name} {r.y.isCurrent && <Badge color="green">Current</Badge>}</TD>
                  <TD>{r.y.terms.length} / 3</TD>
                  <TD className="text-right">{r.enrolled} / {activeStudents}</TD>
                  <TD className="text-right">{r.withSubjects}</TD>
                  <TD className="text-right">{r.allocations}</TD>
                  <TD className="text-right">{r.feeStructures}</TD>
                  <TD className="text-right">{r.exams}</TD>
                  <TD className="text-xs">{r.warnings.length ? <span className="text-amber-800">{r.warnings.join("; ")}</span> : <span className="text-emerald-700">Ready</span>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {years.map((y) => (
        <Card key={y.id}>
          <CardHeader>
            <CardTitle>{y.name} {y.isCurrent && <Badge color="green" className="ml-2">Current</Badge>}</CardTitle>
            <span className="flex gap-2">
            {!y.isCurrent && <ConfirmAction action={deleteAcademicYear} fields={{ id: y.id }} label="Delete year" variant="ghost" confirm={`Delete ${y.name} with its terms and teacher allocations? Only possible while no students, exams or fees use it.`} />}
            <FormDialog trigger="Edit year" title={`Edit ${y.name}`} action={saveAcademicYear} triggerVariant="outline" triggerSize="sm">
              <input type="hidden" name="id" value={y.id} />
              <TextField label="Name" name="name" defaultValue={y.name} required />
              <Grid><TextField label="Start date" name="startDate" type="date" defaultValue={isoDate(y.startDate)} required /><TextField label="End date" name="endDate" type="date" defaultValue={isoDate(y.endDate)} required /></Grid>
            </FormDialog>
            </span>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Term</TH><TH>Opens</TH><TH>Closes</TH><TH>Next term begins</TH><TH /></tr></THead>
              <tbody>
                {y.terms.map((t) => (
                  <TR key={t.id}>
                    <TD>{t.name} {t.isCurrent && <Badge color="green">Current</Badge>}</TD>
                    <TD>{fmtDate(t.startDate)}</TD>
                    <TD>{fmtDate(t.endDate)}</TD>
                    <TD>{fmtDate(t.nextTermStart)}</TD>
                    <TD className="flex justify-end gap-2">
                      {!t.isCurrent && <ConfirmAction action={setCurrentTerm} fields={{ id: t.id }} label="Make current" confirm={`Make ${y.name} ${t.name} the current term?`} />}
                      <FormDialog trigger="Edit" title={`Edit ${t.name}`} action={saveTerm} triggerVariant="outline" triggerSize="sm">
                        <input type="hidden" name="id" value={t.id} />
                        <TermFields yearOpts={yearOpts} t={t} />
                      </FormDialog>
                    </TD>
                  </TR>
                ))}
                {y.terms.length === 0 && <TR><TD colSpan={5}>No terms yet.</TD></TR>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TermFields({ yearOpts, t }: { yearOpts: { value: string; label: string }[]; t?: { academicYearId: string; number: number; name: string; startDate: Date; endDate: Date; nextTermStart: Date | null } }) {
  return (
    <>
      <Grid>
        <SelectField label="Academic year" name="academicYearId" options={yearOpts} defaultValue={t?.academicYearId} required />
        <SelectField label="Term number" name="number" options={[1, 2, 3].map((n) => ({ value: String(n), label: `Term ${n}` }))} defaultValue={String(t?.number ?? 1)} required />
      </Grid>
      <TextField label="Name" name="name" defaultValue={t?.name ?? ""} placeholder="Term 1" required />
      <Grid>
        <TextField label="Opening date" name="startDate" type="date" defaultValue={isoDate(t?.startDate)} required />
        <TextField label="Closing date" name="endDate" type="date" defaultValue={isoDate(t?.endDate)} required />
      </Grid>
      <TextField label="Next term begins (shown on report cards)" name="nextTermStart" type="date" defaultValue={isoDate(t?.nextTermStart)} />
    </>
  );
}
