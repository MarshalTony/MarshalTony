import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveBudget } from "@/server/actions/finance";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { ugx } from "@/lib/utils";

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("finance.view", "finance.manage");
  const params = await searchParams;
  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const year = years.find((y) => y.id === sp(params, "yearId")) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return null;
  const [cats, budgets, spent] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.budget.findMany({ where: { academicYearId: year.id } }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { status: "PAID", date: { gte: year.startDate, lte: year.endDate } }, _sum: { amount: true } }),
  ]);
  return (
    <>
      <div className="mb-3 flex justify-end">
        {can(user, "finance.manage") && (
          <FormDialog trigger="Set budget line" title={`Budget ${year.name}`} action={saveBudget}>
            <input type="hidden" name="academicYearId" value={year.id} />
            <SelectField label="Category" name="categoryId" required options={cats.map((c) => ({ value: c.id, label: c.name }))} />
            <TextField label="Amount (UGX)" name="amount" type="number" min="0" required />
          </FormDialog>
        )}
      </div>
      <FilterBar filters={[{ name: "yearId", label: "Year", allowAll: false, value: year.id, options: years.map((y) => ({ value: y.id, label: y.name })) }]} />
      <Table>
        <THead><tr><TH>Category</TH><TH className="text-right">Budget</TH><TH className="text-right">Spent (paid)</TH><TH className="text-right">Remaining</TH><TH>Used</TH></tr></THead>
        <tbody>
          {cats.map((c) => {
            const b = Number(budgets.find((x) => x.categoryId === c.id)?.amount ?? 0);
            const s = Number(spent.find((x) => x.categoryId === c.id)?._sum.amount ?? 0);
            const pct = b ? (s / b) * 100 : 0;
            return (
              <TR key={c.id}>
                <TD>{c.name}</TD><TD className="text-right">{ugx(b, false)}</TD><TD className="text-right">{ugx(s, false)}</TD>
                <TD className={`text-right ${b - s < 0 ? "font-semibold text-red-700" : ""}`}>{ugx(b - s, false)}</TD>
                <TD className="w-40">{b ? <div className="h-2 rounded bg-slate-100"><div className={`h-2 rounded ${pct > 100 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div> : <span className="text-xs text-slate-400">no budget</span>}</TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
