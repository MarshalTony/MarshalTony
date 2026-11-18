import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { recordIncome } from "@/server/actions/finance";
import { FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Pagination, Table, THead, TH, TR, TD, pageParams, type SP } from "@/components/data-table";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

export default async function IncomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("finance.view", "finance.manage");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const [rows, total] = await Promise.all([prisma.incomeRecord.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip, take }), prisma.incomeRecord.count()]);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Income other than school fees (donations, grants, canteen, hire of facilities…). Fees are recorded under School Fees.</p>
        {can(user, "finance.manage") && (
          <FormDialog trigger="Record income" title="Record income" action={recordIncome}>
            <Grid>
              <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
              <TextField label="Source" name="source" required placeholder="Donation, Canteen, Grant…" />
              <TextField label="Amount (UGX)" name="amount" type="number" min="1" required />
              <SelectField label="Method" name="method" required options={[{ value: "CASH", label: "Cash" }, { value: "BANK", label: "Bank" }, { value: "MOBILE_MONEY", label: "Mobile Money" }, { value: "CHEQUE", label: "Cheque" }]} />
            </Grid>
            <TextField label="Description" name="description" />
          </FormDialog>
        )}
      </div>
      <Table>
        <THead><tr><TH>Date</TH><TH>Ref</TH><TH>Source</TH><TH>Description</TH><TH>Method</TH><TH className="text-right">Amount</TH></tr></THead>
        <tbody>{rows.map((r) => <TR key={r.id}><TD className="text-xs">{fmtDate(r.date)}</TD><TD className="font-mono text-xs">{r.referenceNo}</TD><TD>{r.source}</TD><TD className="text-xs">{r.description}</TD><TD className="text-xs">{r.method}</TD><TD className="text-right">{ugx(r.amount)}</TD></TR>)}</tbody>
      </Table>
      <Pagination base="/finance/income" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
