import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { loadMissing } from "@/server/exams/missing";
import { papersLabel } from "@/lib/missing-scores";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";

export const metadata = { title: "Students missing scores" };

/** Report readiness → the learners still missing exam marks (per paper) or Activities of Integration scores, per stream and subject. */
export default async function MissingScoresPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requirePage("exams.manage", "marks.approve", "results.view");
  const { id } = await params;
  const q = await searchParams;
  if (!(await prisma.exam.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const classId = sp(q, "classId"), streamId = sp(q, "streamId"), subjectId = sp(q, "subjectId");
  const data = await loadMissing(id, { classId, streamId, subjectId });
  const cls = data.classes.find((c) => c.id === classId);
  const query = new URLSearchParams(Object.entries({ examId: id, classId, streamId, subjectId }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={`Students missing scores — ${data.exam.name}`}
        description="Every learner who still has no exam mark (for A-Level, per paper) or no Activities of Integration score for a chapter (S1–S4). ABS and EX count as entered. Print it or send it to the teachers concerned."
        actions={<>
          <Button asChild variant="outline"><a href={`/api/reports/missing-scores?${query}&format=pdf`} target="_blank"><FileText />PDF</a></Button>
          <Button asChild variant="outline"><a href={`/api/reports/missing-scores?${query}&format=xlsx`}><Download />Excel</a></Button>
          <Button asChild variant="outline"><Link href={`/exams/${id}/readiness${classId ? `?classId=${classId}` : ""}`}>Back to readiness</Link></Button>
        </>}
      />
      <ScorePicker fields={[
        { name: "classId", label: "Class", placeholder: "All classes", value: classId, options: data.classes.map((c) => ({ value: c.id, label: c.name })), resets: ["streamId"] },
        { name: "streamId", label: "Stream", placeholder: "All streams", value: streamId, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
        { name: "subjectId", label: "Subject", placeholder: "All subjects", value: subjectId, options: data.subjects.map((s) => ({ value: s.id, label: s.name })) },
      ]} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Learners with something missing" value={data.totals.learners} />
        <StatCard label="Exam marks missing" value={data.totals.marks} hint="counting each paper" />
        <StatCard label="Activity scores missing" value={data.totals.chapters} hint="S1–S4 chapters" />
      </div>
      {data.groups.length === 0 ? <Alert tone="success">Nobody is missing a score{cls ? ` in ${cls.name}` : ""}. All marks{data.totals.chapters === 0 ? " and activity scores" : ""} are in.</Alert> : (
        <div className="space-y-4">
          {data.groups.map((g) => (
            <Card key={`${g.streamId}:${g.subjectId}`}>
              <CardHeader>
                <CardTitle>
                  {g.classCode} {g.streamName} · {g.subject} <span className="text-sm font-normal text-slate-500">({g.learners.length} learner{g.learners.length === 1 ? "" : "s"})</span>
                  <span className={`block text-xs font-normal ${g.teachers.length ? "text-slate-500" : "text-red-700"}`}>Teacher: {g.teachers.join(" / ") || "no teacher allocated"}</span>
                </CardTitle>
                <Button asChild size="sm" variant="outline"><Link href={`/exams/${id}/marks?streamId=${g.streamId}&subjectId=${g.subjectId}`}>Enter marks</Link></Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>#</TH><TH>Learner</TH><TH>Adm. No.</TH><TH>Exam mark missing</TH>{g.oLevel && <TH>Activity chapters not scored</TH>}</tr></THead>
                  <tbody>{g.learners.map((l, i) => (
                    <TR key={l.studentId}>
                      <TD className="text-slate-500">{i + 1}</TD>
                      <TD><Link className="font-medium text-brand-800 hover:underline" href={`/students/${l.studentId}`}>{l.name}</Link></TD>
                      <TD className="font-mono text-xs">{l.admissionNo}</TD>
                      <TD>{l.papers.length ? <Badge color="red">{papersLabel(l.papers, g.paperCount)}</Badge> : <span className="text-xs text-emerald-700">entered</span>}</TD>
                      {g.oLevel && <TD className="text-xs">{l.chapters.length ? l.chapters.join(", ") : <span className="text-emerald-700">all scored</span>}</TD>}
                    </TR>
                  ))}</tbody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
