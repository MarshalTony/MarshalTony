import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { IMPORT_KINDS, columnsOf } from "@/server/imports/kinds";
import { cancelImport, commitImport } from "@/server/actions/imports";
import { ActionForm, CheckboxField, ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";

export default async function ImportPreview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage();
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch || (batch.createdById !== user.id && !user.roles.includes("ADMIN"))) notFound();
  const def = IMPORT_KINDS[batch.kind];
  const columns = def ? await columnsOf(def, (batch.context ?? {}) as Record<string, string>).catch(() => def.columns) : [];
  const rows = batch.rows as { rowNumber: number; values: Record<string, string> }[];
  const errors = batch.errors as { rowNumber: number; errors: string[] }[];
  const errByRow = new Map(errors.map((e) => [e.rowNumber, e.errors]));
  return (
    <>
      <PageHeader title={`Import preview — ${def?.title ?? batch.kind}`} description={batch.fileName} actions={<StatusBadge status={batch.status} />} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs uppercase text-slate-500">Rows in file</p><p className="text-2xl font-semibold">{rows.length}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-slate-500">Valid</p><p className="text-2xl font-semibold text-emerald-700">{batch.validCount}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-slate-500">With errors</p><p className="text-2xl font-semibold text-red-700">{batch.errorCount}</p></Card>
      </div>
      {batch.status === "PREVIEW" && (
        <Card className="mb-5">
          <CardHeader><CardTitle>Confirm</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {batch.errorCount > 0 && (
              <Alert tone="warn">
                {batch.errorCount} row(s) have errors and will NOT be imported. Download the error report, fix those rows and upload them again later.
              </Alert>
            )}
            <div className="flex flex-wrap items-start gap-3">
              <ActionForm action={commitImport} submitLabel={`Import ${batch.validCount} valid row(s)`} submitVariant="success">
                <input type="hidden" name="batchId" value={batch.id} />
                {batch.errorCount > 0 && <CheckboxField name="acknowledge" label={`I understand that ${batch.errorCount} invalid row(s) will be skipped`} />}
              </ActionForm>
              <ConfirmAction action={cancelImport} fields={{ batchId: batch.id }} label="Cancel import" size="default" />
            </div>
          </CardContent>
        </Card>
      )}
      {batch.errorCount > 0 && (
        <Button asChild variant="outline" className="mb-3"><a href={`/api/imports/${batch.id}/errors`}><Download />Download error report</a></Button>
      )}
      <Table>
        <THead><tr><TH>Row</TH><TH>Check</TH>{columns.map((c) => <TH key={c.key}>{c.header}</TH>)}</tr></THead>
        <tbody>
          {rows.slice(0, 500).map((r) => {
            const errs = errByRow.get(r.rowNumber);
            return (
              <TR key={r.rowNumber} className={errs ? "bg-red-50/60" : ""}>
                <TD>{r.rowNumber}</TD>
                <TD className="min-w-[200px] text-xs">{errs ? <span className="text-red-700">{errs.join("; ")}</span> : <span className="text-emerald-700">OK</span>}</TD>
                {columns.map((c) => <TD key={c.key} className="whitespace-nowrap text-xs">{r.values[c.key]}</TD>)}
              </TR>
            );
          })}
        </tbody>
      </Table>
      {rows.length > 500 && <p className="mt-2 text-xs text-slate-500">Showing the first 500 rows.</p>}
    </>
  );
}
