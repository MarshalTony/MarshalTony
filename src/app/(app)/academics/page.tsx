import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveCombination, saveSubject } from "@/server/actions/academics";
import { CheckboxField, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

const CATS = [{ value: "COMPULSORY", label: "Compulsory (O)" }, { value: "ELECTIVE", label: "Elective (O)" }, { value: "PRINCIPAL", label: "Principal (A)" }, { value: "SUBSIDIARY", label: "Subsidiary (A)" }];

export default async function SubjectsPage() {
  const user = await requirePage("academics.view");
  const manage = can(user, "academics.manage");
  const [subjects, combos, depts] = await Promise.all([
    prisma.subject.findMany({ orderBy: [{ level: "asc" }, { category: "asc" }, { name: "asc" }], include: { department: true } }),
    prisma.subjectCombination.findMany({ orderBy: { code: "asc" }, include: { subjects: { include: { subject: true } }, _count: { select: { students: true } } } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const aSubjects = subjects.filter((s) => s.level === "A_LEVEL" && s.isActive);
  const subjectFields = (s?: (typeof subjects)[number]) => (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Grid>
        <TextField label="Code" name="code" defaultValue={s?.code} required />
        <TextField label="Short name" name="shortName" defaultValue={s?.shortName ?? ""} />
      </Grid>
      <TextField label="Name" name="name" defaultValue={s?.name} required />
      <Grid>
        <SelectField label="Level" name="level" defaultValue={s?.level} required options={[{ value: "O_LEVEL", label: "O-Level" }, { value: "A_LEVEL", label: "A-Level" }]} />
        <SelectField label="Category" name="category" defaultValue={s?.category} required options={CATS} />
        <TextField label="Weight" name="weight" type="number" step="0.01" defaultValue={s ? Number(s.weight).toString() : "1"} hint="Used in weighted averages and points" required />
        <SelectField label="Department" name="departmentId" defaultValue={s?.departmentId ?? ""} placeholder="—" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
        <TextField label="Number of papers" name="paperCount" type="number" min={1} max={4} defaultValue={String(s?.paperCount ?? 1)} required hint="A-Level: marks are entered per paper (P/1, P/2) and the report shows each paper" />
      </Grid>
      <CheckboxField name="hasPractical" label="Has a practical paper" defaultChecked={s?.hasPractical} />
      <CheckboxField name="isActive" label="Active" defaultChecked={s?.isActive ?? true} />
    </>
  );
  const comboFields = (c?: (typeof combos)[number]) => (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Grid><TextField label="Code" name="code" defaultValue={c?.code} required /><TextField label="Name" name="name" defaultValue={c?.name} required /></Grid>
      <div className="grid grid-cols-2 gap-1">
        {aSubjects.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="subjectIds[]" value={s.id} defaultChecked={c?.subjects.some((x) => x.subjectId === s.id)} />
            {s.name} <span className="text-xs text-slate-400">{s.category.toLowerCase()}</span>
          </label>
        ))}
      </div>
      <CheckboxField name="isActive" label="Active" defaultChecked={c?.isActive ?? true} />
    </>
  );
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
          {manage && <FormDialog trigger="New subject" title="New subject" action={saveSubject} triggerSize="sm">{subjectFields()}</FormDialog>}
        </CardHeader>
        <CardContent>
          <Table>
            <THead><tr><TH>Code</TH><TH>Name</TH><TH>Level</TH><TH>Category</TH><TH>Weight</TH><TH>Dept</TH><TH /></tr></THead>
            <tbody>
              {subjects.map((s) => (
                <TR key={s.id} className={s.isActive ? "" : "opacity-50"}>
                  <TD className="font-mono text-xs">{s.code}</TD>
                  <TD>{s.name} {s.hasPractical && <Badge>practical</Badge>} {s.paperCount > 1 && <Badge color="blue">{s.paperCount} papers</Badge>}</TD>
                  <TD>{s.level === "O_LEVEL" ? "O" : "A"}</TD>
                  <TD className="text-xs">{s.category.toLowerCase()}</TD>
                  <TD>{Number(s.weight)}</TD>
                  <TD className="text-xs">{s.department?.name}</TD>
                  <TD className="text-right">{manage && <FormDialog trigger="Edit" title={`Edit ${s.name}`} action={saveSubject} triggerVariant="outline" triggerSize="sm">{subjectFields(s)}</FormDialog>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>A-Level combinations</CardTitle>
          {manage && <FormDialog trigger="New" title="New combination" action={saveCombination} triggerSize="sm">{comboFields()}</FormDialog>}
        </CardHeader>
        <CardContent className="space-y-2">
          {combos.map((c) => (
            <div key={c.id} className="rounded border border-slate-200 p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{c.code} <span className="font-normal text-slate-500">· {c._count.students} students</span></p>
                {manage && <FormDialog trigger="Edit" title={`Edit ${c.code}`} action={saveCombination} triggerVariant="outline" triggerSize="sm">{comboFields(c)}</FormDialog>}
              </div>
              <p className="text-xs text-slate-500">{c.subjects.map((x) => x.subject.name).join(", ")}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
