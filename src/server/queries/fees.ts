import { prisma } from "@/lib/db";

/** Balance per student (debits − credits) for the given student ids. */
export async function balancesFor(studentIds: string[]) {
  if (!studentIds.length) return new Map<string, number>();
  const rows = await prisma.ledgerEntry.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _sum: { debit: true, credit: true } });
  return new Map(rows.map((r) => [r.studentId, Math.round((Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0)) * 100) / 100]));
}

/** Net confirmed collections (payments minus reversals) between two instants. */
export async function collections(from: Date, to: Date) {
  const [paid, reversed] = await Promise.all([
    prisma.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { paidAt: { gte: from, lt: to }, reversal: { isNot: null } }, _sum: { amount: true }, _count: true }),
  ]);
  return { amount: Number(paid._sum.amount ?? 0) - Number(reversed._sum.amount ?? 0), count: paid._count - reversed._count };
}

export async function totalOutstanding(classId?: string) {
  const rows = await prisma.$queryRaw<{ owed: number; credit: number; debtors: bigint }[]>`
    SELECT COALESCE(SUM(CASE WHEN b > 0 THEN b ELSE 0 END), 0)::float AS owed,
           COALESCE(SUM(CASE WHEN b < 0 THEN -b ELSE 0 END), 0)::float AS credit,
           COUNT(*) FILTER (WHERE b > 0) AS debtors
    FROM (SELECT l."studentId", SUM(l.debit) - SUM(l.credit) AS b FROM "LedgerEntry" l JOIN "Student" s ON s.id = l."studentId"
          WHERE s.status = 'ACTIVE' AND (${classId ?? null}::text IS NULL OR s."classId" = ${classId ?? null}) GROUP BY l."studentId") t`;
  return { owed: rows[0]?.owed ?? 0, credit: rows[0]?.credit ?? 0, debtors: Number(rows[0]?.debtors ?? 0) };
}

/** Daily net collections for the last `days` days (Kampala dates). */
export async function dailyCollections(days = 14) {
  const rows = await prisma.$queryRaw<{ day: string; amount: number }[]>`
    SELECT to_char((p."paidAt" AT TIME ZONE 'Africa/Kampala')::date, 'YYYY-MM-DD') AS day,
           SUM(CASE WHEN r.id IS NULL THEN p.amount ELSE 0 END)::float AS amount
    FROM "Payment" p LEFT JOIN "PaymentReversal" r ON r."paymentId" = p.id
    WHERE p."paidAt" >= NOW() - (${days} || ' days')::interval GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.day, r.amount]));
  const out: { day: string; amount: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(d);
    out.push({ day: key.slice(5), amount: map.get(key) ?? 0 });
  }
  return out;
}

export function kampalaDayRange(date = new Date()) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(date);
  const start = new Date(`${key}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 86400_000) };
}
