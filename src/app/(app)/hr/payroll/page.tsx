import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { adjustPayslip, approvePayroll, preparePayroll } from "@/server/actions/hr";
import { ActionForm, ConfirmAction, FormDialog, Grid, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { ugx } from "@/lib/utils";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("payroll.manage");
  const params = await searchParams;
  const now = new Date();
  const year = Number(sp(params, "year") ?? now.getFullYear());
  const month = Number(sp(params, "month") ?? now.getMonth() + 1);
  const recs = await prisma.payrollRecord.findMany({ where: { year, month }, include: { staff: true }, orderBy: { staff: { lastName: "asc" } } });
  const sum = (k: "basic" | "allowances" | "paye" | "nssf" | "advanceRecovery" | "otherDeductions" | "net") => recs.reduce((a, r) => a + Number(r[k]), 0);
  const status = recs[0]?.status;
  return (
    <>
      <PageHeader title={`Payroll — ${new Date(year, month - 1).toLocaleString("en-GB", { month: "long" })} ${year}`} description="PAYE and NSSF use the statutory rates in the system (confirm each financial year). Confidential." />
      <FilterBar filters={[
        { name: "month", label: "Month", allowAll: false, value: String(month), options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en-GB", { month: "long" }) })) },
        { name: "year", label: "Year", allowAll: false, value: String(year), options: [year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) })) },
      ]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <ActionForm action={preparePayroll} submitLabel={recs.length ? "Recalculate drafts" : "Prepare payroll"} className="space-y-0"><input type="hidden" name="year" value={year} /><input type="hidden" name="month" value={month} /></ActionForm>
        {status === "DRAFT" && <ConfirmAction action={approvePayroll} fields={{ year: String(year), month: String(month), status: "APPROVED" }} label="Approve payroll" variant="success" size="default" confirm="Approve all draft payslips for this month?" />}
        {status === "APPROVED" && <ConfirmAction action={approvePayroll} fields={{ year: String(year), month: String(month), status: "PAID" }} label="Mark as paid" variant="success" size="default" confirm="Mark this payroll as paid? Advance recoveries will be applied." />}
        {recs.length > 0 && ["pdf", "xlsx"].map((f) => <Button key={f} asChild variant="outline"><a href={`/api/reports/payroll?year=${year}&month=${month}&format=${f}`} target="_blank"><Download />{f.toUpperCase()}</a></Button>)}
      </div>
      {recs.length === 0 ? <Alert>No payroll for this month yet. Staff need a basic salary on their record.</Alert> : (
        <Table>
          <THead><tr><TH>Staff</TH><TH className="text-right">Basic</TH><TH className="text-right">Allowances</TH><TH className="text-right">PAYE</TH><TH className="text-right">NSSF 5%</TH><TH className="text-right">Advance</TH><TH className="text-right">Other</TH><TH className="text-right">Net pay</TH><TH>Status</TH><TH /></tr></THead>
          <tbody>
            {recs.map((r) => (
              <TR key={r.id}>
                <TD>{r.staff.lastName} {r.staff.firstName}<p className="text-xs text-slate-500">{r.staff.bankName} {r.staff.bankAccount}</p></TD>
                {(["basic", "allowances", "paye", "nssf", "advanceRecovery", "otherDeductions"] as const).map((k) => <TD key={k} className="text-right">{ugx(r[k], false)}</TD>)}
                <TD className="text-right font-semibold">{ugx(r.net, false)}</TD><TD><StatusBadge status={r.status} /></TD>
                <TD>{r.status === "DRAFT" && (
                  <FormDialog trigger="Adjust" title="Adjust payslip" action={adjustPayslip} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="id" value={r.id} />
                    <Grid><TextField label="Allowances" name="allowances" type="number" min="0" defaultValue={String(Number(r.allowances))} /><TextField label="Other deductions" name="otherDeductions" type="number" min="0" defaultValue={String(Number(r.otherDeductions))} /></Grid>
                  </FormDialog>
                )}</TD>
              </TR>
            ))}
            <TR className="font-semibold"><TD>Total</TD>{(["basic", "allowances", "paye", "nssf", "advanceRecovery", "otherDeductions", "net"] as const).map((k) => <TD key={k} className="text-right">{ugx(sum(k), false)}</TD>)}<TD /><TD /></TR>
          </tbody>
        </Table>
      )}
    </>
  );
}
