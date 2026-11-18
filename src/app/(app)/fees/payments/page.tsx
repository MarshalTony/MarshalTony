import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, hrefWith, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDateTime, isoDate, studentName, ugx } from "@/lib/utils";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("fees.view", "fees.collect");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const from = sp(params, "from") ?? isoDate(new Date(Date.now() - 30 * 86400_000));
  const to = sp(params, "to") ?? isoDate(new Date());
  const q = sp(params, "q");
  const where = {
    paidAt: { gte: new Date(`${from}T00:00:00+03:00`), lt: new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86400_000) },
    ...(sp(params, "methodId") ? { methodId: sp(params, "methodId") } : {}),
    ...(q ? { OR: [{ receiptNo: { contains: q, mode: "insensitive" as const } }, { transactionRef: { contains: q, mode: "insensitive" as const } }, { externalRef: { contains: q, mode: "insensitive" as const } }, { student: { admissionNo: { contains: q, mode: "insensitive" as const } } }, { student: { lastName: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total, sum, rev, methods] = await Promise.all([
    prisma.payment.findMany({ where, include: { student: { include: { schoolClass: true } }, method: true, reversal: true }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }], skip, take }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { ...where, reversal: { isNot: null } }, _sum: { amount: true } }),
    prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
  ]);
  const net = Number(sum._sum.amount ?? 0) - Number(rev._sum.amount ?? 0);
  return (
    <>
      <FilterBar searchPlaceholder="Receipt, transaction ref, bank/MoMo ref, student" filters={[{ name: "methodId", label: "Method", options: methods.map((m) => ({ value: m.id, label: m.name })) }]}>
        <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
        <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
      </FilterBar>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>Net collected in range: <b>{ugx(net)}</b> ({total} transactions, reversals excluded from the total)</p>
        <div className="flex gap-2">
          {["xlsx", "pdf", "csv"].map((f) => <Button key={f} asChild variant="outline" size="sm"><a href={hrefWith("/api/reports/fees", params, { type: "payments", from, to, format: f })}><Download />{f.toUpperCase()}</a></Button>)}
        </div>
      </div>
      <Table>
        <THead><tr><TH>Date</TH><TH>Receipt</TH><TH>Txn ref</TH><TH>Student</TH><TH>Method / ref</TH><TH className="text-right">Amount</TH><TH /></tr></THead>
        <tbody>
          {rows.map((p) => (
            <TR key={p.id} className={p.reversal ? "opacity-60" : ""}>
              <TD className="whitespace-nowrap text-xs">{fmtDateTime(p.paidAt)}</TD>
              <TD className="font-mono text-xs"><a href={`/api/pdf/receipt/${p.id}`} target="_blank" className="text-brand-700 hover:underline">{p.receiptNo}</a></TD>
              <TD className="font-mono text-xs">{p.transactionRef}</TD>
              <TD><Link href={`/fees/students/${p.studentId}`} className="hover:underline">{studentName(p.student)}</Link><p className="text-xs text-slate-500">{p.student.admissionNo} · {p.student.schoolClass.code}</p></TD>
              <TD className="text-xs">{p.method.name}<br />{p.externalRef}</TD>
              <TD className="text-right">{ugx(p.amount)}</TD>
              <TD>{p.reversal && <StatusBadge status="REVERSED" />}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination base="/fees/payments" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
