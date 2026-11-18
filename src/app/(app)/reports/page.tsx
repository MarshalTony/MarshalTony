import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { classTree, classOptions, streamOptions } from "@/server/queries/lookups";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { ReportLauncher } from "@/components/report-launcher";
import { isoDate } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requirePage();
  const [tree, terms, methods, exams] = await Promise.all([
    classTree(),
    prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.paymentMethod.findMany({ orderBy: { name: "asc" } }),
    prisma.exam.findMany({ where: { resultsGeneratedAt: { not: null } }, include: { term: { include: { academicYear: true } } }, orderBy: { resultsGeneratedAt: "desc" }, take: 20 }),
  ]);
  const cls = classOptions(tree);
  const str = streamOptions(tree);
  const termOpts = terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }));
  const monthAgo = isoDate(new Date(Date.now() - 30 * 86400_000));
  const today = isoDate(new Date());
  type R = { title: string; description: string; base: string; fixed?: Record<string, string>; fields?: { name: string; label: string; type: "select" | "date"; options?: { value: string; label: string }[]; value?: string; required?: boolean }[] };
  const groups: [string, boolean, R[]][] = [
    ["Students", can(user, "students.view"), [
      { title: "Student register", description: "All students with class, status and primary guardian", base: "/api/export/students", fields: [{ name: "classId", label: "Class", type: "select", options: cls }, { name: "streamId", label: "Stream", type: "select", options: str }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "ALL"].map((s) => ({ value: s, label: s })) }] },
    ]],
    ["Examinations", can(user, "results.view"), [
      { title: "Broadsheet / class results", description: "Positions, subject marks and grades", base: "/api/reports/broadsheet", fields: [{ name: "examId", label: "Exam", type: "select", required: true, options: exams.map((e) => ({ value: e.id, label: `${e.term.academicYear.name} ${e.term.name} — ${e.name}` })) }, { name: "classId", label: "Class", type: "select", options: cls }, { name: "streamId", label: "Stream", type: "select", options: str }] },
    ]],
    ["Attendance", can(user, "attendance.view"), [
      { title: "Stream attendance summary", description: "Present / absent / late / excused per student", base: "/api/reports/attendance", fields: [{ name: "streamId", label: "Stream", type: "select", required: true, options: str }, { name: "from", label: "From", type: "date", value: monthAgo }, { name: "to", label: "To", type: "date", value: today }] },
    ]],
    ["School fees", can(user, "fees.view"), [
      { title: "Payments register", description: "Every payment with receipt and transaction numbers", base: "/api/reports/fees", fixed: { type: "payments" }, fields: [{ name: "from", label: "From", type: "date", value: monthAgo }, { name: "to", label: "To", type: "date", value: today }, { name: "methodId", label: "Method", type: "select", options: methods.map((m) => ({ value: m.id, label: m.name })) }, { name: "classId", label: "Class", type: "select", options: cls }, { name: "termId", label: "Term", type: "select", options: termOpts }] },
      { title: "Daily collections", description: "Totals per day by payment method", base: "/api/reports/fees", fixed: { type: "daily" }, fields: [{ name: "from", label: "From", type: "date", value: monthAgo }, { name: "to", label: "To", type: "date", value: today }] },
      { title: "Outstanding balances", description: "Students who owe, with guardian contacts", base: "/api/reports/fees", fixed: { type: "outstanding" }, fields: [{ name: "classId", label: "Class", type: "select", options: cls }, { name: "streamId", label: "Stream", type: "select", options: str }] },
      { title: "Fees by class (termly)", description: "Invoiced vs collected per class", base: "/api/reports/fees", fixed: { type: "classes" }, fields: [{ name: "termId", label: "Term", type: "select", options: termOpts }] },
    ]],
    ["Accounts", can(user, "finance.view", "finance.manage"), [
      { title: "Income & expenditure", description: "Cash-basis statement", base: "/api/reports/finance", fixed: { type: "income-expenditure" }, fields: [{ name: "from", label: "From", type: "date", value: `${new Date().getFullYear()}-01-01` }, { name: "to", label: "To", type: "date", value: today }] },
      { title: "Cash flow (12 months)", description: "Monthly inflows and outflows", base: "/api/reports/finance", fixed: { type: "cashflow" } },
      { title: "Expense register", description: "All payment vouchers", base: "/api/reports/finance", fixed: { type: "expenses" }, fields: [{ name: "from", label: "From", type: "date", value: monthAgo }, { name: "to", label: "To", type: "date", value: today }] },
    ]],
    ["Staff", can(user, "staff.view"), [{ title: "Staff list", description: "Biodata and employment", base: "/api/export/staff" }]],
    ["Payroll", can(user, "payroll.manage"), [{ title: "Payroll register", description: "Monthly payroll (confidential)", base: "/api/reports/payroll", fields: [{ name: "year", label: "Year", type: "select", required: true, value: String(new Date().getFullYear()), options: [0, 1].map((d) => String(new Date().getFullYear() - d)).map((y) => ({ value: y, label: y })) }, { name: "month", label: "Month", type: "select", required: true, value: String(new Date().getMonth() + 1), options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i).toLocaleString("en-GB", { month: "long" }) })) }] }]],
    ["Operations", true, [
      ...(can(user, "inventory.manage") ? [{ title: "Inventory & assets", description: "Stock on hand, value, reorder alerts", base: "/api/reports/ops", fixed: { type: "inventory" } }] : []),
      ...(can(user, "library.manage") ? [{ title: "Library loans", description: "Books out and overdue", base: "/api/reports/ops", fixed: { type: "library" } }] : []),
      ...(can(user, "transport.manage") ? [{ title: "Transport register", description: "Students per route", base: "/api/reports/ops", fixed: { type: "transport" } }] : []),
      ...(can(user, "discipline.manage") ? [{ title: "Discipline", description: "Incidents and actions (confidential)", base: "/api/reports/ops", fixed: { type: "discipline" } }] : []),
      ...(can(user, "uneb.manage") ? [{ title: "UNEB candidate list", description: "UCE / UACE school register", base: "/api/reports/uneb", fields: [{ name: "level", label: "Exam", type: "select" as const, required: true, value: "UCE", options: [{ value: "UCE", label: "UCE" }, { value: "UACE", label: "UACE" }] }, { name: "year", label: "Year", type: "select" as const, required: true, value: String(new Date().getFullYear()), options: [String(new Date().getFullYear()), String(new Date().getFullYear() + 1)].map((y) => ({ value: y, label: y })) }] }] : []),
    ]],
  ];
  const visible = groups.filter(([, ok, items]) => ok && items.length);
  return (
    <>
      <PageHeader title="Reports" description="Every report carries the school letterhead, title, generation date and the name of the person who generated it. Downloads are audited." />
      <div className="grid gap-5 lg:grid-cols-2">
        {visible.map(([g, , items]) => (
          <Card key={g}>
            <CardHeader><CardTitle>{g}</CardTitle></CardHeader>
            <CardContent className="space-y-4">{items.map((r) => <ReportLauncher key={r.title} {...r} />)}</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
