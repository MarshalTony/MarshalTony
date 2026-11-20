import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { studentWhere } from "@/server/queries/students";
import { studentName } from "@/lib/utils";

/** Quick student search for pickers: ?q=name or admission no.&examId= (limits to the exam's classes). Max 12 results. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json([]);
  const examId = url.searchParams.get("examId");
  const classIds = examId ? (await prisma.examClass.findMany({ where: { examId }, select: { classId: true } })).map((c) => c.classId) : null;
  const students = await prisma.student.findMany({
    // Include students who have since left, so past report cards can still be printed.
    where: { AND: [studentWhere({ q, status: "ALL" }), classIds ? { OR: [{ classId: { in: classIds } }, { examResults: { some: { examId: examId! } } }] } : {}] },
    include: { schoolClass: true, stream: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 12,
  });
  return Response.json(students.map((s) => ({ id: s.id, name: studentName(s), admissionNo: s.admissionNo, cls: `${s.schoolClass.code} ${s.stream.name}`, status: s.status })));
}
