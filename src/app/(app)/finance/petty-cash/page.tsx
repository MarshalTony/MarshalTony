import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { pettyCashEntry } from "@/server/actions/finance";
import { FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { withRunningBalance } from "@/lib/fees";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

export default async function PettyCashPage() {
  const user = await requirePage("finance.view", "finance.manage");
  const entries = await prisma.pettyCashEntry.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
  const rows = withRunningBalance(entries.map((e) => ({ ...e, debit: e.type === "IN" ? e.amount : 0, credit: e.type === "OUT" ? e.amount : 0 }))).reverse();
  const balance = rows[0]?.balance ?? 0;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <StatCard label="Petty cash on hand" value={ugx(balance)} />
        {can(user, "finance.manage") && (
          <FormDialog trigger="New entry" title="Petty cash entry" action={pettyCashEntry}>
            <Grid>
              <SelectField label="Type" name="type" required options={[{ value: "OUT", label: "Spend (out)" }, { value: "IN", label: "Top-up (in)" }]} />
              <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
              <TextField label="Amount (UGX)" name="amount" type="number" min="1" required />
            </Grid>
            <TextField label="Description" name="description" required />
          </FormDialog>
        )}
      </div>
      <Table>
        <THead><tr><TH>Date</TH><TH>Description</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH><TH className="text-right">Balance</TH></tr></THead>
        <tbody>{rows.map((r) => <TR key={r.id}><TD className="text-xs">{fmtDate(r.date)}</TD><TD>{r.description}</TD><TD className="text-right">{r.type === "IN" ? ugx(r.amount, false) : ""}</TD><TD className="text-right">{r.type === "OUT" ? ugx(r.amount, false) : ""}</TD><TD className="text-right font-medium">{ugx(r.balance, false)}</TD></TR>)}</tbody>
      </Table>
    </>
  );
}
