import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { fmtDateTime, studentName } from "@/lib/utils";

/** type = payments | outstanding | daily | classes ; filters: from,to,methodId,classId,streamId,termId ; format = pdf|xlsx|csv */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "fees.view")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const g = (k: string) => u.searchParams.get(k) || undefined;
  const format = g("format") ?? "pdf";
  const type = g("type") ?? "payments";
  const from = g("from") ? new Date(`${g("from")}T00:00:00+03:00`) : new Date(Date.now() - 30 * 86400_000);
  const to = g("to") ? new Date(new Date(`${g("to")}T00:00:00+03:00`).getTime() + 86400_000) : new Date(Date.now() + 86400_000);
  const range = `${fmtDateTime(from).slice(0, 11)} – ${fmtDateTime(new Date(to.getTime() - 1)).slice(0, 11)}`;

  if (type === "payments" || type === "daily") {
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte: from, lt: to }, ...(g("methodId") ? { methodId: g("methodId") } : {}), ...(g("classId") ? { student: { classId: g("classId") } } : {}), ...(g("termId") ? { termId: g("termId") } : {}) },
      include: { student: { include: { schoolClass: true } }, method: true, reversal: true }, orderBy: { paidAt: "asc" },
    });
    if (type === "daily") {
      const by = new Map<string, Record<string, number>>();
      const methods = [...new Set(payments.map((p) => p.method.name))];
      for (const p of payments) {
        if (p.reversal) continue;
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(p.paidAt);
        const r = by.get(day) ?? {};
        r[p.method.name] = (r[p.method.name] ?? 0) + Number(p.amount);
        r.total = (r.total ?? 0) + Number(p.amount);
        by.set(day, r);
      }
      const rows = [...by.entries()].map(([day, r]) => ({ day, ...r }));
      const totals: Record<string, number | string> = { day: "Total" };
      for (const k of [...methods, "total"]) totals[k] = rows.reduce((a, r: any) => a + (r[k] ?? 0), 0);
      return tableReport({ title: "Daily Fees Collections", subtitle: range, filename: "daily-collections",
        columns: [{ key: "day", header: "Date", width: 10 }, ...methods.map((m) => ({ key: m, header: m, width: 12, money: true })), { key: "total", header: "Total", width: 12, money: true }],
        rows, totals }, format, user);
    }
    const net = payments.filter((p) => !p.reversal).reduce((a, p) => a + Number(p.amount), 0);
    return tableReport({
      title: "Fees Payments Register", subtitle: `${range} · ${payments.length} transactions · reversed payments shown but excluded from the total`, filename: "payments", landscape: true,
      columns: [
        { key: "date", header: "Date", width: 12 }, { key: "receipt", header: "Receipt", width: 13 }, { key: "txn", header: "Txn ref", width: 15 }, { key: "adm", header: "Adm No", width: 11 },
        { key: "name", header: "Student", width: 18 }, { key: "cls", header: "Class", width: 5 }, { key: "method", header: "Method", width: 12 }, { key: "ref", header: "Ext. ref", width: 11 },
        { key: "amount", header: "Amount", width: 10, money: true }, { key: "status", header: "Status", width: 8 },
      ],
      rows: payments.map((p) => ({ date: fmtDateTime(p.paidAt), receipt: p.receiptNo, txn: p.transactionRef, adm: p.student.admissionNo, name: studentName(p.student), cls: p.student.schoolClass.code, method: p.method.name, ref: p.externalRef, amount: Number(p.amount), status: p.reversal ? "REVERSED" : "OK" })),
      totals: { name: "Net total", amount: net },
    }, format, user);
  }

  if (type === "outstanding") {
    const rows = await prisma.$queryRaw<{ id: string; billed: number; paid: number; balance: number }[]>`
      SELECT s.id, COALESCE(SUM(l.debit),0)::float billed, COALESCE(SUM(l.credit),0)::float paid, COALESCE(SUM(l.debit)-SUM(l.credit),0)::float balance
      FROM "Student" s LEFT JOIN "LedgerEntry" l ON l."studentId" = s.id
      WHERE s.status = 'ACTIVE' AND (${g("classId") ?? null}::text IS NULL OR s."classId" = ${g("classId") ?? null}) AND (${g("streamId") ?? null}::text IS NULL OR s."streamId" = ${g("streamId") ?? null})
      GROUP BY s.id HAVING COALESCE(SUM(l.debit)-SUM(l.credit),0) > 0 ORDER BY balance DESC`;
    const st = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { schoolClass: true, stream: true, guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
    const by = new Map(st.map((s) => [s.id, s]));
    return tableReport({
      title: "Outstanding Fees Balances", subtitle: `${rows.length} students with a balance`, filename: "outstanding-fees", landscape: true,
      columns: [
        { key: "adm", header: "Adm No", width: 11 }, { key: "name", header: "Student", width: 18 }, { key: "cls", header: "Class", width: 7 }, { key: "res", header: "D/B", width: 5 },
        { key: "guardian", header: "Guardian", width: 16 }, { key: "phone", header: "Phone", width: 11 },
        { key: "billed", header: "Billed", width: 10, money: true }, { key: "paid", header: "Paid/credits", width: 10, money: true }, { key: "balance", header: "Balance", width: 10, money: true },
      ],
      rows: rows.map((r) => { const s = by.get(r.id)!; const gd = s.guardians[0]?.guardian; return { adm: s.admissionNo, name: studentName(s), cls: `${s.schoolClass.code} ${s.stream.name}`, res: s.residence === "DAY" ? "D" : "B", guardian: gd?.fullName, phone: gd?.phone, billed: r.billed, paid: r.paid, balance: r.balance }; }),
      totals: { name: "Total", billed: rows.reduce((a, r) => a + r.billed, 0), paid: rows.reduce((a, r) => a + r.paid, 0), balance: rows.reduce((a, r) => a + r.balance, 0) },
    }, format, user);
  }

  if (type === "classes") {
    const termId = g("termId") ?? (await prisma.term.findFirst({ where: { isCurrent: true } }))?.id;
    const rows = await prisma.$queryRaw<{ code: string; name: string; students: bigint; invoiced: number; collected: number; balance: number }[]>`
      SELECT c.code, c.name, COUNT(DISTINCT s.id) students,
        COALESCE(SUM(l.debit) FILTER (WHERE l.type = 'INVOICE' AND l."termId" = ${termId ?? null}), 0)::float invoiced,
        COALESCE(SUM(l.credit) FILTER (WHERE l.type = 'PAYMENT' AND l."termId" = ${termId ?? null}), 0)::float - COALESCE(SUM(l.debit) FILTER (WHERE l.type = 'PAYMENT_REVERSAL' AND l."termId" = ${termId ?? null}), 0)::float collected,
        COALESCE(SUM(l.debit) - SUM(l.credit), 0)::float balance
      FROM "SchoolClass" c JOIN "Student" s ON s."classId" = c.id AND s.status = 'ACTIVE' LEFT JOIN "LedgerEntry" l ON l."studentId" = s.id
      GROUP BY c.code, c.name, c."order" ORDER BY c."order"`;
    const term = termId ? await prisma.term.findUnique({ where: { id: termId }, include: { academicYear: true } }) : null;
    return tableReport({
      title: "Fees Summary by Class", subtitle: term ? `${term.academicYear.name} ${term.name} (invoiced & collected); balances are all-time` : undefined, filename: "fees-by-class",
      columns: [{ key: "name", header: "Class", width: 14 }, { key: "students", header: "Students", width: 8 }, { key: "invoiced", header: "Invoiced", width: 12, money: true }, { key: "collected", header: "Collected", width: 12, money: true }, { key: "rate", header: "Collected %", width: 9 }, { key: "balance", header: "Outstanding", width: 12, money: true }],
      rows: rows.map((r) => ({ name: r.name, students: Number(r.students), invoiced: r.invoiced, collected: r.collected, rate: r.invoiced ? `${((r.collected / r.invoiced) * 100).toFixed(1)}%` : "—", balance: r.balance })),
      totals: { name: "Total", students: rows.reduce((a, r) => a + Number(r.students), 0), invoiced: rows.reduce((a, r) => a + r.invoiced, 0), collected: rows.reduce((a, r) => a + r.collected, 0), balance: rows.reduce((a, r) => a + r.balance, 0) },
    }, format, user);
  }
  return new Response("Unknown report type", { status: 400 });
}
