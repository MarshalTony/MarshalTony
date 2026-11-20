import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { IMPORT_KINDS } from "@/server/imports/kinds";
import { uploadImport } from "@/server/actions/imports";
import { ActionForm, SelectField, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Excel imports" };

export default async function ImportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage();
  const params = await searchParams;
  const kinds = Object.entries(IMPORT_KINDS).filter(([k, d]) => k !== "marks" && k !== "activities" && can(user, ...d.permission));
  const selected = sp(params, "kind") ?? kinds[0]?.[0];
  const recent = await prisma.importBatch.findMany({ where: user.roles.includes("ADMIN") ? {} : { createdById: user.id }, orderBy: { createdAt: "desc" }, take: 15 });
  return (
    <>
      <PageHeader title="Excel imports" description="Upload → check the preview → confirm. Nothing is saved until you confirm, and invalid rows are never silently dropped." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Upload a file</CardTitle></CardHeader>
          <CardContent>
            {kinds.length === 0 ? <p className="text-sm text-slate-500">You have no import permissions.</p> : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {kinds.map(([k, d]) => (
                    <Button key={k} asChild variant="outline" size="sm"><a href={`/api/templates/${k}`}><Download />{d.title} template</a></Button>
                  ))}
                </div>
                <ActionForm action={uploadImport} submitLabel="Upload and check" refresh={false}>
                  <SelectField label="Import type" name="kind" defaultValue={selected} options={kinds.map(([k, d]) => ({ value: k, label: d.title }))} required />
                  <TextField label="Excel file (.xlsx)" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
                </ActionForm>
                <p className="mt-3 text-xs text-slate-500">Marks are imported from each exam&apos;s marks-entry page, with a template pre-filled with the right students.</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>When</TH><TH>Type</TH><TH>Rows</TH><TH>Status</TH></tr></THead>
              <tbody>
                {recent.map((b) => (
                  <TR key={b.id}>
                    <TD className="text-xs"><Link href={`/imports/${b.id}`} className="text-brand-700 hover:underline">{fmtDateTime(b.createdAt)}</Link></TD>
                    <TD>{IMPORT_KINDS[b.kind]?.title ?? b.kind}<p className="text-xs text-slate-500">{b.fileName}</p></TD>
                    <TD className="text-xs">{b.validCount} ok / {b.errorCount} errors</TD>
                    <TD><StatusBadge status={b.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
