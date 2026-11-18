import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("year"));
  const month = Number(u.searchParams.get("month"));
  const recs = await prisma.payrollRecord.findMany({ where: { year, month }, include: { staff: true }, orderBy: { staff: { lastName: "asc" } } });
  const keys = ["basic", "allowances", "paye", "nssf", "advanceRecovery", "otherDeductions", "net"] as const;
  return tableReport({
    title: "Payroll Register", subtitle: `${new Date(year, month - 1).toLocaleString("en-GB", { month: "long" })} ${year} — CONFIDENTIAL`, filename: `payroll-${year}-${month}`, landscape: true,
    columns: [{ key: "no", header: "Staff No", width: 9 }, { key: "name", header: "Name", width: 16 }, { key: "bank", header: "Bank / account", width: 16 }, ...keys.map((k) => ({ key: k, header: k === "advanceRecovery" ? "Advance" : k === "otherDeductions" ? "Other" : k.toUpperCase(), width: 9, money: true }))],
    rows: recs.map((r) => ({ no: r.staff.staffNo, name: `${r.staff.lastName} ${r.staff.firstName}`, bank: [r.staff.bankName, r.staff.bankAccount].filter(Boolean).join(" "), ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) })),
    totals: { name: "Totals", ...Object.fromEntries(keys.map((k) => [k, recs.reduce((a, r) => a + Number(r[k]), 0)])) },
  }, u.searchParams.get("format"), user);
}
