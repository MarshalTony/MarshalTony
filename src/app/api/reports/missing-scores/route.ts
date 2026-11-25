import { getCurrentUser, can } from "@/server/auth";
import { loadMissing } from "@/server/exams/missing";
import { tableReport } from "@/server/reports/table";
import { papersLabel } from "@/lib/missing-scores";

/** Learners missing scores: ?examId=…[&classId][&streamId][&subjectId]&format=pdf|xlsx */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "exams.manage", "marks.approve", "results.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const examId = url.searchParams.get("examId");
  if (!examId) return new Response("examId required", { status: 400 });
  const data = await loadMissing(examId, { classId: url.searchParams.get("classId"), streamId: url.searchParams.get("streamId"), subjectId: url.searchParams.get("subjectId") });
  const rows = data.groups.flatMap((g) => g.learners.map((l) => ({
    cls: `${g.classCode} ${g.streamName}`, subject: g.subject, teacher: g.teachers.join(" / ") || "not allocated",
    adm: l.admissionNo, name: l.name, mark: papersLabel(l.papers, g.paperCount), chapters: l.chapters.join(", "),
  })));
  return tableReport({
    title: `Students missing scores — ${data.exam.name}`,
    subtitle: `${data.totals.learners} learner(s) · ${data.totals.marks} exam mark(s) and ${data.totals.chapters} activity score(s) missing`,
    filename: "missing-scores", landscape: true,
    columns: [
      { key: "cls", header: "Class", width: 8 }, { key: "subject", header: "Subject", width: 16 }, { key: "teacher", header: "Teacher", width: 18 },
      { key: "adm", header: "Adm. No.", width: 14 }, { key: "name", header: "Learner", width: 22 }, { key: "mark", header: "Exam mark missing", width: 12 },
      { key: "chapters", header: "Activity chapters not scored", width: 30 },
    ],
    rows,
  }, url.searchParams.get("format"), user);
}
