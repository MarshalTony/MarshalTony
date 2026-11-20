import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { studentName } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "results.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const examId = url.searchParams.get("examId");
  if (!examId) return new Response("examId required", { status: 400 });
  const classId = url.searchParams.get("classId") || (await prisma.examClass.findFirst({ where: { examId }, orderBy: { schoolClass: { order: "asc" } } }))?.classId;
  if (!classId) return new Response("Exam has no classes", { status: 404 });
  const streamId = url.searchParams.get("streamId") ?? undefined;
  const [exam, cls, results, subs, examSubjects] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.schoolClass.findUnique({ where: { id: classId } }),
    prisma.examResult.findMany({ where: { examId, classId, ...(streamId ? { streamId } : {}) }, include: { student: { include: { stream: true } } }, orderBy: [{ classPosition: { sort: "asc", nulls: "last" } }] }),
    prisma.subjectResult.findMany({ where: { examId, student: { classId } } }),
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true }, orderBy: [{ subject: { reportOrder: "asc" } }, { subject: { name: "asc" } }] }),
  ]);
  if (!exam || !cls) return new Response("Not found", { status: 404 });
  const map = new Map(subs.map((s) => [`${s.studentId}:${s.subjectId}`, s]));
  return tableReport({
    title: `Broadsheet — ${cls.name}${streamId ? ` ${results[0]?.student.stream.name ?? ""}` : ""}`, subtitle: exam.name, filename: `broadsheet-${cls.code}`, landscape: true,
    columns: [
      { key: "pos", header: "Pos", width: 4 }, { key: "adm", header: "Adm No", width: 10 }, { key: "name", header: "Student", width: 18 }, { key: "str", header: "Str", width: 4 },
      ...examSubjects.map((e) => ({ key: e.subjectId, header: e.subject.shortName ?? e.subject.code, width: 6, align: "center" as const })),
      { key: "total", header: "Total", width: 6 }, { key: "avg", header: "Avg", width: 6 }, { key: "pts", header: "Pts/Agg", width: 6 }, { key: "div", header: "Div", width: 4 }, { key: "spos", header: "Str pos", width: 6 },
    ],
    rows: results.map((r) => ({
      pos: r.classPosition ?? "-", adm: r.student.admissionNo, name: studentName(r.student), str: r.student.stream.name,
      ...Object.fromEntries(examSubjects.map((e) => {
        const s = map.get(`${r.studentId}:${e.subjectId}`);
        return [e.subjectId, !s ? "" : s.percentage !== null ? `${Number(s.percentage).toFixed(0)} ${s.grade ?? ""}` : s.grade ?? "-"];
      })),
      total: Number(r.total), avg: Number(r.average).toFixed(1), pts: r.aggregate ?? Number(r.points ?? 0), div: r.division ?? "", spos: r.streamPosition ? `${r.streamPosition}/${r.streamSize}` : "-",
    })),
  }, url.searchParams.get("format"), user);
}
