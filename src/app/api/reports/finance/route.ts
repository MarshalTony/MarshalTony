import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { incomeExpenditure, monthlyCashflow } from "@/server/queries/finance";
import { fmtDate } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance.view", "finance.manage")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const fromS = u.searchParams.get("from") ?? `${new Date().getFullYear()}-01-01`;
  const toS = u.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  // Expense.date is a DATE column: bound by calendar day.
  const from = new Date(`${fromS}T00:00:00Z`);
  const to = new Date(new Date(`${toS}T00:00:00Z`).getTime() + 86400_000);
  const format = u.searchParams.get("format");
  const type = u.searchParams.get("type");
  if (type === "income-expenditure") {
    const r = await incomeExpenditure(fromS, toS);
    return tableReport({
      title: "Income & Expenditure Statement", subtitle: `${fromS} to ${toS} (cash basis)`, filename: "income-expenditure",
      columns: [{ key: "section", header: "Section", width: 12 }, { key: "label", header: "Item", width: 30 }, { key: "amount", header: "Amount (UGX)", width: 14, money: true }],
      rows: [
        ...r.income.map((x) => ({ section: "Income", label: x.label, amount: x.amount })), { section: "", label: "Total income", amount: r.totalIncome },
        ...r.expenditure.map((x) => ({ section: "Expenditure", label: x.label, amount: x.amount })), { section: "", label: "Total expenditure", amount: r.totalExpenditure },
      ],
      totals: { label: r.surplus >= 0 ? "SURPLUS" : "DEFICIT", amount: Math.abs(r.surplus) },
    }, format, user);
  }
  if (type === "cashflow") {
    const cf = await monthlyCashflow(12);
    return tableReport({
      title: "Cash Flow Summary", subtitle: "Last 12 months", filename: "cash-flow",
      columns: [{ key: "month", header: "Month", width: 10 }, { key: "inflow", header: "Inflows", width: 14, money: true }, { key: "outflow", header: "Outflows", width: 14, money: true }, { key: "net", header: "Net", width: 14, money: true }],
      rows: cf, totals: { month: "Total", inflow: cf.reduce((a, m) => a + m.inflow, 0), outflow: cf.reduce((a, m) => a + m.outflow, 0), net: cf.reduce((a, m) => a + m.net, 0) },
    }, format, user);
  }
  if (type === "expenses") {
    const rows = await prisma.expense.findMany({ where: { date: { gte: from, lt: to } }, include: { category: true, supplier: true }, orderBy: { date: "asc" } });
    return tableReport({
      title: "Expense Register", subtitle: `${fromS} to ${toS} · totals count PAID vouchers only`, filename: "expenses", landscape: true,
      columns: [{ key: "date", header: "Date", width: 9 }, { key: "pv", header: "Voucher", width: 12 }, { key: "cat", header: "Category", width: 14 }, { key: "payee", header: "Payee", width: 16 }, { key: "desc", header: "Description", width: 24 }, { key: "method", header: "Method", width: 9 }, { key: "status", header: "Status", width: 9 }, { key: "amount", header: "Amount", width: 11, money: true }],
      rows: rows.map((e) => ({ date: fmtDate(e.date), pv: e.voucherNo, cat: e.category.name, payee: e.payee, desc: e.description, method: e.method, status: e.status, amount: Number(e.amount) })),
      totals: { desc: "Total paid", amount: rows.filter((e) => e.status === "PAID").reduce((a, e) => a + Number(e.amount), 0) },
    }, format, user);
  }
  return new Response("Unknown report", { status: 400 });
}
