import { Download } from "lucide-react";
import { requirePage } from "@/server/auth";
import { incomeExpenditure, monthlyCashflow } from "@/server/queries/finance";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { SimpleBarChart } from "@/components/charts";
import { isoDate, ugx } from "@/lib/utils";

export default async function FinanceSummary({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("finance.view", "finance.manage");
  const params = await searchParams;
  const from = sp(params, "from") ?? `${new Date().getFullYear()}-01-01`;
  const to = sp(params, "to") ?? isoDate(new Date());
  const r = await incomeExpenditure(from, to);
  const cf = await monthlyCashflow(12);
  const q = `from=${from}&to=${to}`;
  return (
    <div className="space-y-5">
      <FilterBar>
        <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
        <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
      </FilterBar>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total income" value={ugx(r.totalIncome)} />
        <StatCard label="Total expenditure" value={ugx(r.totalExpenditure)} />
        <StatCard label={r.surplus >= 0 ? "Surplus" : "Deficit"} value={ugx(Math.abs(r.surplus))} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[["income-expenditure", "Income & expenditure"], ["cashflow", "Cash flow"], ["expenses", "Expense register"]].map(([t, l]) =>
          ["pdf", "xlsx"].map((f) => <Button key={t + f} asChild variant="outline" size="sm"><a href={`/api/reports/finance?type=${t}&${q}&format=${f}`} target="_blank"><Download />{l} ({f.toUpperCase()})</a></Button>))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Income</CardTitle></CardHeader>
          <CardContent><Table><tbody>{r.income.map((x) => <TR key={x.label}><TD>{x.label}</TD><TD className="text-right">{ugx(x.amount)}</TD></TR>)}<TR><TD className="font-semibold">Total</TD><TD className="text-right font-semibold">{ugx(r.totalIncome)}</TD></TR></tbody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenditure (paid)</CardTitle></CardHeader>
          <CardContent><Table><tbody>{r.expenditure.map((x) => <TR key={x.label}><TD>{x.label}</TD><TD className="text-right">{ugx(x.amount)}</TD></TR>)}{r.expenditure.length === 0 && <TR><TD className="text-slate-500">No paid expenses in this period.</TD></TR>}<TR><TD className="font-semibold">Total</TD><TD className="text-right font-semibold">{ugx(r.totalExpenditure)}</TD></TR></tbody></Table></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Cash flow — last 12 months</CardTitle></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <SimpleBarChart title="Net cash flow by month (UGX)" data={cf.map((m) => ({ month: m.month.slice(2), net: m.net }))} x="month" y="net" />
          <Table>
            <THead><tr><TH>Month</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH><TH className="text-right">Net</TH></tr></THead>
            <tbody>{cf.map((m) => <TR key={m.month}><TD>{m.month}</TD><TD className="text-right">{ugx(m.inflow, false)}</TD><TD className="text-right">{ugx(m.outflow, false)}</TD><TD className={`text-right ${m.net < 0 ? "text-red-700" : ""}`}>{ugx(m.net, false)}</TD></TR>)}</tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
