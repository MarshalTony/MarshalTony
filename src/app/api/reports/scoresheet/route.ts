import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { audit } from "@/server/audit";
import { loadScoreSheet, renderScoreSheetPdf } from "@/server/reports/scoresheet";
import { tableReport } from "@/server/reports/table";
import { pdfResponse } from "@/server/http";

/** Score sheet: ?examId=…&classId=…[&streamId=…][&sort=name]&format=pdf|xlsx */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "results.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const examId = url.searchParams.get("examId");
  if (!examId) return new Response("examId required", { status: 400 });
  const classId = url.searchParams.get("classId") || (await prisma.examClass.findFirst({ where: { examId }, orderBy: { schoolClass: { order: "asc" } } }))?.classId;
  if (!classId) return new Response("Exam has no classes", { status: 404 });
  const streamId = url.searchParams.get("streamId") || null;
  const sort = url.searchParams.get("sort") === "name" ? "name" : "position";
  const sheet = await loadScoreSheet(examId, classId, streamId, sort);
  const format = url.searchParams.get("format") ?? "pdf";
  const file = sheet.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (format === "pdf") {
    await audit(user.id, "REPORT", "Report", file, { title: sheet.title, format: "pdf", rows: sheet.rows.length });
    return pdfResponse(await renderScoreSheetPdf(sheet, `${user.fullName} (${user.username})`), `${file}.pdf`);
  }
  // Excel / CSV: one column per subject score and one per grade, then the summary rows.
  const subjectCols = sheet.subjects.flatMap((sub) => [
    { key: `s_${sub.id}`, header: sub.code, width: 7, align: "center" as const },
    { key: `g_${sub.id}`, header: `${sub.code} gr.`, width: 6, align: "center" as const },
  ]);
  const rows: Record<string, string | number | null>[] = sheet.rows.map((r, i) => ({
    no: i + 1, adm: r.admissionNo, name: r.name, sex: r.sex, stream: r.stream,
    ...Object.fromEntries(sheet.subjects.flatMap((sub) => { const c = r.cells.get(sub.id); return [[`s_${sub.id}`, c?.score ?? ""], [`g_${sub.id}`, c?.grade ?? ""]]; })),
    count: r.count, total: r.total ?? "", avg: r.average === null ? "" : Number(r.average.toFixed(1)), grade: sheet.aLevel ? r.points ?? "" : r.grade ?? "",
    cpos: r.classPos ?? "", spos: r.streamPos ?? "",
  }));
  const stat = (label: string, f: (st: NonNullable<ReturnType<typeof sheet.stats.get>>) => string | number | null) =>
    ({ name: label, ...Object.fromEntries(sheet.subjects.map((sub) => [`s_${sub.id}`, f(sheet.stats.get(sub.id)!) ?? ""])) });
  rows.push({}, stat("Candidates", (x) => x.candidates), stat("Subject average", (x) => x.mean), stat("Highest", (x) => x.highest), stat("Lowest", (x) => x.lowest),
    ...sheet.gradeOrder.map((g) => stat(`Grade ${g}`, (x) => x.grades[g] ?? 0)),
    { name: "Subject teacher", ...Object.fromEntries(sheet.subjects.map((sub) => [`s_${sub.id}`, sub.teachers])) });
  return tableReport({
    title: sheet.title, subtitle: `${sheet.subtitle} — ${sheet.basis}`, filename: file, landscape: true,
    columns: [
      { key: "no", header: "#", width: 4 }, { key: "adm", header: "Adm. No.", width: 14 }, { key: "name", header: "Name", width: 26 }, { key: "sex", header: "Sex", width: 4 },
      ...(sheet.wholeClass ? [{ key: "stream", header: "Stream", width: 8 }] : []),
      ...subjectCols,
      { key: "count", header: "No. subj", width: 6 }, { key: "total", header: "Total", width: 7 }, { key: "avg", header: "Average", width: 8 },
      { key: "grade", header: sheet.aLevel ? "Points" : "Grade", width: 6 }, { key: "cpos", header: "Class pos.", width: 7 }, { key: "spos", header: "Stream pos.", width: 7 },
    ],
    rows,
  }, format, user);
}
