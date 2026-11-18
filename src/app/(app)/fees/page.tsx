import Link from "next/link";
import { Wallet, AlertTriangle, CalendarDays, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { billTerm, sendFeeReminders } from "@/server/actions/fees";
import { collections, dailyCollections, kampalaDayRange, totalOutstanding } from "@/server/queries/fees";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle, StatCard, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { TrendLineChart } from "@/components/charts";
import { fmtDateTime, studentName, ugx } from "@/lib/utils";

export default async function FeesOverview() {
  const user = await requirePage("fees.view", "fees.collect");
  const term = await prisma.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  const today = kampalaDayRange();
  const [todayC, termC, out, trend, recent, classes, terms, invoiced] = await Promise.all([
    collections(today.start, today.end),
    term ? collections(term.startDate, new Date(term.nextTermStart ?? new Date(term.endDate.getTime() + 60 * 86400_000))) : Promise.resolve({ amount: 0, count: 0 }),
    totalOutstanding(),
    dailyCollections(14),
    prisma.payment.findMany({ take: 10, orderBy: { createdAt: "desc" }, include: { student: true, method: true, reversal: true } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    term ? prisma.invoice.aggregate({ where: { termId: term.id }, _sum: { total: true }, _count: true }) : null,
  ]);
  return (
    <div className="space-y-5">
      <form action="/fees/students" method="get" className="flex gap-2">
        <input name="q" placeholder="Find a student to receive payment (name or admission no.)" className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" aria-label="Find student" />
        <button className="rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Search</button>
      </form>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected today" value={ugx(todayC.amount)} hint={`${todayC.count} receipt(s)`} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label={`Collected ${term ? term.name : "this term"}`} value={ugx(termC.amount)} hint={invoiced ? `of ${ugx(invoiced._sum.total)} invoiced` : undefined} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Outstanding balances" value={ugx(out.owed)} hint={`${out.debtors} students owe`} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Prepaid credit" value={ugx(out.credit)} icon={<CalendarDays className="h-5 w-5" />} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Daily collections — last 14 days</CardTitle></CardHeader>
          <CardContent><TrendLineChart title="Net collections (UGX)" data={trend} x="day" y="amount" money /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Billing & reminders</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {can(user, "fees.manage") && (
              <FormDialog trigger="Issue term invoices" title="Issue term invoices" action={billTerm} triggerVariant="default">
                <p className="text-sm text-slate-600">Invoices every active student who has no invoice for the term yet, using the fee structure for their class and day/boarding status.</p>
                <SelectField label="Term" name="termId" defaultValue={term?.id} required options={terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }))} />
                <SelectField label="Class" name="classId" placeholder="All classes" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
                <TextField label="Due date" name="dueDate" type="date" />
              </FormDialog>
            )}
            {can(user, "communication.send") && (
              <FormDialog trigger="Send fee reminders" title="SMS fee reminders" action={sendFeeReminders} triggerVariant="secondary">
                <SelectField label="Class" name="classId" placeholder="All classes" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
                <TextField label="Minimum balance (UGX)" name="minBalance" type="number" defaultValue="100000" required />
                <p className="text-xs text-slate-500">Uses the FEES_REMINDER template. Each SMS costs roughly UGX 25–35 with Africa&apos;s Talking.</p>
              </FormDialog>
            )}
            <p className="text-slate-600">Reports: <Link className="text-brand-700 underline" href="/reports">daily, termly, outstanding, class reports</Link></p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Latest payments</CardTitle><Link href="/fees/payments" className="text-sm text-brand-700 hover:underline">All payments</Link></CardHeader>
        <CardContent>
          <Table>
            <THead><tr><TH>Receipt</TH><TH>Student</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH>Recorded</TH><TH /></tr></THead>
            <tbody>
              {recent.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs"><a className="text-brand-700 hover:underline" href={`/api/pdf/receipt/${p.id}`} target="_blank">{p.receiptNo}</a></TD>
                  <TD><Link href={`/fees/students/${p.studentId}`} className="hover:underline">{studentName(p.student)}</Link></TD>
                  <TD>{p.method.name}</TD>
                  <TD className="text-right">{ugx(p.amount)}</TD>
                  <TD className="text-xs">{fmtDateTime(p.createdAt)}</TD>
                  <TD>{p.reversal && <StatusBadge status="REVERSED" />}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
