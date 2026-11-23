import { prisma } from "@/lib/db";
import { CATEGORY_LABEL, streamCategory } from "@/lib/combination-stream";

const CAT_OPTS = [{ value: "ARTS", label: "Arts combinations" }, { value: "SCIENCES", label: "Sciences combinations" }];
import { requirePage } from "@/server/auth";
import { saveClass, saveStream } from "@/server/actions/settings";
import { CheckboxField, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

export default async function ClassSettings() {
  await requirePage("settings.manage");
  const [classes, staff] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: { order: "asc" }, include: { streams: { orderBy: { name: "asc" }, include: { classTeacher: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } } } } }),
    prisma.staff.findMany({ where: { status: "ACTIVE", isTeaching: true }, orderBy: { lastName: "asc" } }),
  ]);
  const staffOpts = staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName}` }));
  const levelOpts = [{ value: "O_LEVEL", label: "O-Level" }, { value: "A_LEVEL", label: "A-Level" }];
  return (
    <div className="space-y-5">
      <FormDialog trigger="New class" title="New class" action={saveClass}>
        <Grid><TextField label="Code" name="code" placeholder="S1" required /><TextField label="Name" name="name" placeholder="Senior 1" required /></Grid>
        <Grid><SelectField label="Level" name="level" options={levelOpts} required /><TextField label="Order" name="order" type="number" defaultValue="1" required /></Grid>
        <CheckboxField name="isActive" label="Active" defaultChecked />
      </FormDialog>
      {classes.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>{c.name} <span className="text-sm font-normal text-slate-500">({c.code} · {c.level === "O_LEVEL" ? "O-Level" : "A-Level"})</span> {!c.isActive && <Badge color="red">Inactive</Badge>}</CardTitle>
            <div className="flex gap-2">
              <FormDialog trigger="Add stream" title={`New stream in ${c.name}`} action={saveStream} triggerVariant="secondary" triggerSize="sm">
                <input type="hidden" name="classId" value={c.id} />
                <TextField label="Stream name" name="name" placeholder="A, B, East, West…" required />
                <TextField label="Capacity" name="capacity" type="number" />
                <SelectField label="Class teacher" name="classTeacherId" options={staffOpts} placeholder="— none —" />
                {c.level === "A_LEVEL" && <SelectField label="Combinations in this stream" name="combinationCategory" placeholder="Any (not by category)" options={CAT_OPTS} hint="Students are placed here by their combination's category." />}
                <CheckboxField name="isActive" label="Active" defaultChecked />
              </FormDialog>
              <FormDialog trigger="Edit class" title={`Edit ${c.name}`} action={saveClass} triggerVariant="outline" triggerSize="sm">
                <input type="hidden" name="id" value={c.id} />
                <Grid><TextField label="Code" name="code" defaultValue={c.code} required /><TextField label="Name" name="name" defaultValue={c.name} required /></Grid>
                <Grid><SelectField label="Level" name="level" options={levelOpts} defaultValue={c.level} required /><TextField label="Order" name="order" type="number" defaultValue={String(c.order)} required /></Grid>
                <CheckboxField name="isActive" label="Active" defaultChecked={c.isActive} />
              </FormDialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Stream</TH><TH>Class teacher</TH><TH>Active students</TH><TH>Capacity</TH><TH /></tr></THead>
              <tbody>
                {c.streams.map((s) => (
                  <TR key={s.id}>
                    <TD>{c.code} {s.name} {!s.isActive && <Badge color="red">Inactive</Badge>} {c.level === "A_LEVEL" && streamCategory(s) && <Badge color={streamCategory(s) === "ARTS" ? "purple" : "blue"}>{CATEGORY_LABEL[streamCategory(s)!]} combinations</Badge>}</TD>
                    <TD>{s.classTeacher ? `${s.classTeacher.lastName} ${s.classTeacher.firstName}` : "—"}</TD>
                    <TD>{s._count.students}</TD>
                    <TD>{s.capacity ?? "—"}</TD>
                    <TD className="text-right">
                      <FormDialog trigger="Edit" title={`Edit stream ${c.code} ${s.name}`} action={saveStream} triggerVariant="outline" triggerSize="sm">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="classId" value={c.id} />
                        <TextField label="Stream name" name="name" defaultValue={s.name} required />
                        <TextField label="Capacity" name="capacity" type="number" defaultValue={s.capacity?.toString() ?? ""} />
                        <SelectField label="Class teacher" name="classTeacherId" options={staffOpts} placeholder="— none —" defaultValue={s.classTeacherId ?? ""} />
                        {c.level === "A_LEVEL" && <SelectField label="Combinations in this stream" name="combinationCategory" placeholder="Any (not by category)" options={CAT_OPTS} defaultValue={s.combinationCategory ?? (streamCategory(s) ?? "")} hint="Students are placed here by their combination's category (Arts / Sciences)." />}
                        <CheckboxField name="isActive" label="Active" defaultChecked={s.isActive} />
                      </FormDialog>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
