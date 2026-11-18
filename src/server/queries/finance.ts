import { prisma } from "@/lib/db";

/** Income & expenditure on a cash basis: fees actually collected (net of reversals) + other income; PAID vouchers + petty cash spent. */
/** `fromDay`/`toDay` are inclusive yyyy-mm-dd days (Kampala). DATE columns and timestamp columns need different bounds. */
export async function incomeExpenditure(fromDay: string, toDay: string) {
  const from = new Date(`${fromDay}T00:00:00+03:00`);
  const to = new Date(new Date(`${toDay}T00:00:00+03:00`).getTime() + 86400_000);
  const dFrom = new Date(`${fromDay}T00:00:00Z`);
  const dTo = new Date(new Date(`${toDay}T00:00:00Z`).getTime() + 86400_000);
  const [fees, feesReversed, other, expenses, petty] = await Promise.all([
    prisma.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { paidAt: { gte: from, lt: to }, reversal: { isNot: null } }, _sum: { amount: true } }),
    prisma.incomeRecord.groupBy({ by: ["source"], where: { date: { gte: dFrom, lt: dTo } }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where: { status: "PAID", date: { gte: dFrom, lt: dTo } }, _sum: { amount: true } }),
    prisma.pettyCashEntry.aggregate({ where: { type: "OUT", date: { gte: dFrom, lt: dTo } }, _sum: { amount: true } }),
  ]);
  const cats = new Map((await prisma.expenseCategory.findMany()).map((c) => [c.id, c.name]));
  const income = [
    { label: "School fees collected", amount: Number(fees._sum.amount ?? 0) - Number(feesReversed._sum.amount ?? 0) },
    ...other.map((o) => ({ label: o.source, amount: Number(o._sum.amount ?? 0) })),
  ];
  const expenditure = [
    ...expenses.map((e) => ({ label: cats.get(e.categoryId) ?? "?", amount: Number(e._sum.amount ?? 0) })),
    ...(Number(petty._sum.amount ?? 0) ? [{ label: "Petty cash expenses", amount: Number(petty._sum.amount ?? 0) }] : []),
  ].sort((a, b) => b.amount - a.amount);
  const ti = income.reduce((a, r) => a + r.amount, 0);
  const te = expenditure.reduce((a, r) => a + r.amount, 0);
  return { income, expenditure, totalIncome: ti, totalExpenditure: te, surplus: ti - te };
}

export async function monthlyCashflow(months = 12) {
  const rows = await prisma.$queryRaw<{ month: string; inflow: number; outflow: number }[]>`
    WITH m AS (SELECT to_char(d, 'YYYY-MM') AS month FROM generate_series(date_trunc('month', NOW()) - ((${months} - 1) || ' months')::interval, date_trunc('month', NOW()), '1 month') d),
    fin AS (SELECT to_char(p."paidAt" AT TIME ZONE 'Africa/Kampala', 'YYYY-MM') AS month, SUM(CASE WHEN r.id IS NULL THEN p.amount ELSE 0 END) AS amt FROM "Payment" p LEFT JOIN "PaymentReversal" r ON r."paymentId" = p.id GROUP BY 1),
    oin AS (SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount) AS amt FROM "IncomeRecord" GROUP BY 1),
    ex AS (SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount) AS amt FROM "Expense" WHERE status = 'PAID' GROUP BY 1),
    pc AS (SELECT to_char(date, 'YYYY-MM') AS month, SUM(amount) AS amt FROM "PettyCashEntry" WHERE type = 'OUT' GROUP BY 1)
    SELECT m.month, (COALESCE(fin.amt,0) + COALESCE(oin.amt,0))::float inflow, (COALESCE(ex.amt,0) + COALESCE(pc.amt,0))::float outflow
    FROM m LEFT JOIN fin USING (month) LEFT JOIN oin USING (month) LEFT JOIN ex USING (month) LEFT JOIN pc USING (month) ORDER BY m.month`;
  return rows.map((r) => ({ ...r, net: r.inflow - r.outflow }));
}
