import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { classTree, classOptions, streamOptions } from "@/server/queries/lookups";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Pagination, Table, THead, TH, TR, TD, hrefWith, pageParams, sp, type SP } from "@/components/data-table";
import { studentName, ugx } from "@/lib/utils";

export default async function FeeAccounts({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("fees.view", "fees.collect");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const classId = sp(params, "classId");
  const streamId = sp(params, "streamId");
  const owing = sp(params, "owing");
  const like = q ? `%${q}%` : null;
  const where = Prisma.sql`s.status = 'ACTIVE'
    AND (${like}::text IS NULL OR s."admissionNo" ILIKE ${like} OR s."firstName" ILIKE ${like} OR s."lastName" ILIKE ${like})
    AND (${classId ?? null}::text IS NULL OR s."classId" = ${classId ?? null})
    AND (${streamId ?? null}::text IS NULL OR s."streamId" = ${streamId ?? null})`;
  const having = owing === "yes" ? Prisma.sql`HAVING COALESCE(SUM(l.debit) - SUM(l.credit), 0) > 0` : owing === "credit" ? Prisma.sql`HAVING COALESCE(SUM(l.debit) - SUM(l.credit), 0) < 0` : Prisma.empty;
  const [rows, countRows, tree] = await Promise.all([
    prisma.$queryRaw<{ id: string; balance: number; billed: number; paid: number }[]>`
      SELECT s.id, COALESCE(SUM(l.debit) - SUM(l.credit), 0)::float AS balance, COALESCE(SUM(l.debit), 0)::float AS billed, COALESCE(SUM(l.credit), 0)::float AS paid
      FROM "Student" s LEFT JOIN "LedgerEntry" l ON l."studentId" = s.id WHERE ${where} GROUP BY s.id ${having}
      ORDER BY balance DESC, s.id LIMIT ${take} OFFSET ${skip}`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM (SELECT s.id FROM "Student" s LEFT JOIN "LedgerEntry" l ON l."studentId" = s.id WHERE ${where} GROUP BY s.id ${having}) t`,
    classTree(),
  ]);
  const students = await prisma.student.findMany({ where: { id: { in: rows.map((r) => r.id) } }, include: { schoolClass: true, stream: true } });
  const byId = new Map(students.map((s) => [s.id, s]));
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button asChild variant="outline"><a href={hrefWith("/api/reports/fees", params, { type: "outstanding", format: "xlsx" })}><Download />Export balances</a></Button>
      </div>
      <FilterBar searchPlaceholder="Name or admission no." filters={[
        { name: "classId", label: "Class", options: classOptions(tree) },
        { name: "streamId", label: "Stream", options: streamOptions(tree) },
        { name: "owing", label: "Balance", options: [{ value: "yes", label: "Owing only" }, { value: "credit", label: "In credit" }] },
      ]} />
      <Table>
        <THead><tr><TH>Adm. No.</TH><TH>Student</TH><TH>Class</TH><TH className="text-right">Billed & debits</TH><TH className="text-right">Paid & credits</TH><TH className="text-right">Balance</TH></tr></THead>
        <tbody>
          {rows.map((r) => {
            const s = byId.get(r.id)!;
            return (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{s.admissionNo}</TD>
                <TD><Link href={`/fees/students/${s.id}`} className="font-medium text-brand-800 hover:underline">{studentName(s)}</Link></TD>
                <TD>{s.schoolClass.code} {s.stream.name} · {s.residence === "DAY" ? "Day" : "Board"}</TD>
                <TD className="text-right">{ugx(r.billed, false)}</TD>
                <TD className="text-right">{ugx(r.paid, false)}</TD>
                <TD className={`text-right font-semibold ${r.balance > 0 ? "text-red-700" : r.balance < 0 ? "text-emerald-700" : ""}`}>{ugx(r.balance, false)}</TD>
              </TR>
            );
          })}
          {rows.length === 0 && <TR><TD colSpan={6} className="py-6 text-center text-slate-500">No students match.</TD></TR>}
        </tbody>
      </Table>
      <Pagination base="/fees/students" params={params} total={Number(countRows[0]?.n ?? 0)} page={page} pageSize={pageSize} />
    </>
  );
}
