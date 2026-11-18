import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { studentName } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "attendance.view")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const streamId = u.searchParams.get("streamId");
  const from = u.searchParams.get("from")!;
  const to = u.searchParams.get("to")!;
  if (!streamId || !from || !to) return new Response("streamId, from and to are required", { status: 400 });
  const stream = await prisma.stream.findUnique({ where: { id: streamId }, include: { schoolClass: true } });
  const [students, rows] = await Promise.all([
    prisma.student.findMany({ where: { streamId, status: "ACTIVE" }, orderBy: { lastName: "asc" } }),
    prisma.studentAttendance.groupBy({ by: ["studentId", "status"], where: { streamId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, _count: true }),
  ]);
  const c = (id: string, st: string) => rows.find((r) => r.studentId === id && r.status === st)?._count ?? 0;
  return tableReport({
    title: `Attendance — ${stream?.schoolClass.name} ${stream?.name}`, subtitle: `${from} to ${to}`, filename: "attendance",
    columns: [{ key: "adm", header: "Adm No", width: 12 }, { key: "name", header: "Student", width: 24 }, { key: "p", header: "Present", width: 7 }, { key: "l", header: "Late", width: 6 }, { key: "a", header: "Absent", width: 7 }, { key: "e", header: "Excused", width: 7 }, { key: "pct", header: "Attendance %", width: 9 }],
    rows: students.map((s) => { const p = c(s.id, "PRESENT"), l = c(s.id, "LATE"), a = c(s.id, "ABSENT"), e = c(s.id, "EXCUSED"); const t = p + l + a + e; return { adm: s.admissionNo, name: studentName(s), p, l, a, e, pct: t ? `${(((p + l) / t) * 100).toFixed(0)}%` : "—" }; }),
  }, u.searchParams.get("format"), user);
}
