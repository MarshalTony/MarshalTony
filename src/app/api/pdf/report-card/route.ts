import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { renderReportCards } from "@/server/reports/report-card";
import { pdfResponse } from "@/server/http";
import { audit } from "@/server/audit";
import { ensureFreshResults } from "@/server/exams/approval";

export const maxDuration = 60;

/**
 * GET ?examId&studentId  — one report card
 * GET ?examId&streamId   — bulk for a stream (staff only)
 * GET ?examId&classId    — bulk for a class (staff only)
 * Parents may open their linked children's cards and students their own, only once the exam is PUBLISHED.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const examId = url.searchParams.get("examId");
  const studentId = url.searchParams.get("studentId");
  const streamId = url.searchParams.get("streamId");
  const classId = url.searchParams.get("classId");
  if (!examId) return new Response("examId required", { status: 400 });
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return new Response("Not found", { status: 404 });

  const staff = can(user, "reportcards.generate", "results.view");
  // Staff printing: include marks saved since results were last generated (when DOS approval is off).
  if (staff) await ensureFreshResults(examId);
  let ids: string[] = [];
  if (studentId) {
    if (!staff) {
      if (exam.status !== "PUBLISHED") return new Response("Results are not published yet.", { status: 403 });
      const own = user.studentId === studentId;
      const child = user.guardianId ? await prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId: user.guardianId } } }) : null;
      if (!own && !child) return new Response("Forbidden", { status: 403 });
    }
    ids = [studentId];
  } else if (streamId || classId) {
    if (!can(user, "reportcards.generate")) return new Response("Forbidden", { status: 403 });
    const rs = await prisma.examResult.findMany({ where: { examId, ...(streamId ? { streamId } : { classId: classId! }) }, select: { studentId: true } });
    ids = rs.map((r) => r.studentId);
  } else return new Response("studentId, streamId or classId required", { status: 400 });

  if (!ids.length) return new Response("No results generated for this selection.", { status: 404 });
  const { buffer, count } = await renderReportCards(examId, ids, user.fullName);
  if (!count) return new Response("No results for this student in this exam.", { status: 404 });
  await audit(user.id, "REPORT_CARDS", "Exam", examId, { count, studentId, streamId, classId });
  return pdfResponse(buffer, `report-cards-${count}.pdf`);
}
