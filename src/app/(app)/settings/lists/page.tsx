import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { saveDepartment, saveExamType, saveMessageTemplate, savePaymentMethod } from "@/server/actions/settings";
import { CheckboxField, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

export default async function ListSettings() {
  await requirePage("settings.manage");
  const [types, methods, depts, templates] = await Promise.all([
    prisma.examType.findMany({ orderBy: { order: "asc" } }),
    prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Examination types</CardTitle>
          <FormDialog trigger="Add" title="New exam type" action={saveExamType} triggerSize="sm">
            <Grid><TextField label="Code" name="code" placeholder="BOT" required /><TextField label="Order" name="order" type="number" defaultValue="10" required /></Grid>
            <TextField label="Name" name="name" required />
            <CheckboxField name="isActive" label="Active" defaultChecked />
          </FormDialog>
        </CardHeader>
        <CardContent>
          <Table><THead><tr><TH>Code</TH><TH>Name</TH><TH /></tr></THead><tbody>
            {types.map((t) => (
              <TR key={t.id}><TD>{t.code}</TD><TD>{t.name} {!t.isActive && <Badge color="red">Inactive</Badge>}</TD><TD className="text-right">
                <FormDialog trigger="Edit" title="Edit exam type" action={saveExamType} triggerVariant="outline" triggerSize="sm">
                  <input type="hidden" name="id" value={t.id} />
                  <Grid><TextField label="Code" name="code" defaultValue={t.code} required /><TextField label="Order" name="order" type="number" defaultValue={String(t.order)} required /></Grid>
                  <TextField label="Name" name="name" defaultValue={t.name} required />
                  <CheckboxField name="isActive" label="Active" defaultChecked={t.isActive} />
                </FormDialog>
              </TD></TR>
            ))}
          </tbody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payment methods</CardTitle>
          <FormDialog trigger="Add" title="New payment method" action={savePaymentMethod} triggerSize="sm">
            <TextField label="Code" name="code" placeholder="STANBIC" required />
            <TextField label="Name" name="name" required />
            <CheckboxField name="isActive" label="Active" defaultChecked />
          </FormDialog>
        </CardHeader>
        <CardContent>
          <Table><THead><tr><TH>Code</TH><TH>Name</TH><TH /></tr></THead><tbody>
            {methods.map((m) => (
              <TR key={m.id}><TD>{m.code}</TD><TD>{m.name} {!m.isActive && <Badge color="red">Inactive</Badge>}</TD><TD className="text-right">
                <FormDialog trigger="Edit" title="Edit payment method" action={savePaymentMethod} triggerVariant="outline" triggerSize="sm">
                  <input type="hidden" name="id" value={m.id} />
                  <TextField label="Code" name="code" defaultValue={m.code} required />
                  <TextField label="Name" name="name" defaultValue={m.name} required />
                  <CheckboxField name="isActive" label="Active" defaultChecked={m.isActive} />
                </FormDialog>
              </TD></TR>
            ))}
          </tbody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <FormDialog trigger="Add" title="New department" action={saveDepartment} triggerSize="sm"><TextField label="Name" name="name" required /></FormDialog>
        </CardHeader>
        <CardContent>
          <Table><THead><tr><TH>Name</TH><TH /></tr></THead><tbody>
            {depts.map((d) => (
              <TR key={d.id}><TD>{d.name}</TD><TD className="text-right">
                <FormDialog trigger="Edit" title="Edit department" action={saveDepartment} triggerVariant="outline" triggerSize="sm">
                  <input type="hidden" name="id" value={d.id} /><TextField label="Name" name="name" defaultValue={d.name} required />
                </FormDialog>
              </TD></TR>
            ))}
          </tbody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Message templates</CardTitle>
          <FormDialog trigger="Add" title="New message template" action={saveMessageTemplate} triggerSize="sm" wide><TemplateFields /></FormDialog>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-slate-500">Placeholders: {"{{guardian}} {{student}} {{admissionNo}} {{balance}} {{amount}} {{receiptNo}} {{date}} {{status}} {{exam}} {{message}}"}</p>
          <Table><THead><tr><TH>Name</TH><TH>Channel</TH><TH /></tr></THead><tbody>
            {templates.map((t) => (
              <TR key={t.id}><TD>{t.name}<p className="text-xs text-slate-500">{t.body.slice(0, 80)}…</p></TD><TD>{t.channel}</TD><TD className="text-right">
                <FormDialog trigger="Edit" title="Edit template" action={saveMessageTemplate} triggerVariant="outline" triggerSize="sm" wide>
                  <input type="hidden" name="id" value={t.id} /><TemplateFields t={t} />
                </FormDialog>
              </TD></TR>
            ))}
          </tbody></Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateFields({ t }: { t?: { code: string; name: string; channel: string; subject: string | null; body: string } }) {
  return (
    <>
      <Grid>
        <TextField label="Code" name="code" defaultValue={t?.code} required />
        <SelectField label="Channel" name="channel" defaultValue={t?.channel} options={["SMS", "EMAIL", "WHATSAPP"].map((c) => ({ value: c, label: c }))} required />
      </Grid>
      <TextField label="Name" name="name" defaultValue={t?.name} required />
      <TextField label="Email subject" name="subject" defaultValue={t?.subject ?? ""} />
      <TextAreaField label="Message" name="body" rows={5} defaultValue={t?.body} required />
    </>
  );
}
