import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { canSeeStudentFees } from "@/server/fees/access";
import { tableReport } from "@/server/reports/table";
import { withRunningBalance } from "@/lib/fees";
import { fmtDate, studentName, ugx } from "@/lib/utils";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!(await canSeeStudentFees(user, id))) return new Response("Not found", { status: 404 });
  const st = await prisma.student.findUnique({ where: { id }, include: { schoolClass: true, stream: true } });
  if (!st) return new Response("Not found", { status: 404 });
  const rows = withRunningBalance(await prisma.ledgerEntry.findMany({ where: { studentId: id }, orderBy: { createdAt: "asc" } }));
  const bal = rows.length ? rows[rows.length - 1].balance : 0;
  const debit = rows.reduce((a, r) => a + Number(r.debit), 0);
  const credit = rows.reduce((a, r) => a + Number(r.credit), 0);
  return tableReport({
    title: "Fees Statement",
    subtitle: `${studentName(st)} · ${st.admissionNo} · ${st.schoolClass.name} ${st.stream.name} · Balance ${ugx(bal)}`,
    filename: `statement-${st.admissionNo.replace(/\W/g, "-")}`,
    columns: [
      { key: "date", header: "Date", width: 10 }, { key: "ref", header: "Reference", width: 14 }, { key: "desc", header: "Description", width: 30 },
      { key: "debit", header: "Debit", width: 11, money: true }, { key: "credit", header: "Credit", width: 11, money: true }, { key: "bal", header: "Balance", width: 11, money: true },
    ],
    rows: rows.map((r) => ({ date: fmtDate(r.createdAt), ref: r.reference, desc: r.description, debit: Number(r.debit) || null, credit: Number(r.credit) || null, bal: r.balance })),
    totals: { desc: "Totals", debit, credit, bal },
  }, new URL(req.url).searchParams.get("format"), user);
}
