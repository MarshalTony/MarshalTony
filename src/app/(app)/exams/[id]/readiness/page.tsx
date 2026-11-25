import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { loadProgress } from "@/server/exams/progress";
import { pctOf, progressOf, type Progress } from "@/lib/exams/progress";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";

export const metadata = { title: "Report readiness" };

const TONE: Record<Progress, string> = { complete: "text-emerald-700", partial: "text-amber-700", none: "text-red-700", na: "text-slate-400" };
const BAR: Record<Progress, string> = { complete: "bg-emerald-500", partial: "bg-amber-500", none: "bg-red-500", na: "bg-slate-200" };

function Meter({ done, expected, state, label }: { done: number; expected: number; state: Progress; label?: string }) {
  if (state === "na") return <span className="text-xs text-slate-400">{label ?? "—"}</span>;
  return (
    <div className="min-w-[7rem]">
      <div className={`text-xs font-medium ${TONE[state]}`}>{label ?? `${done} / ${expected}`}</div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-slate-100"><div className={`h-full ${BAR[state]}`} style={{ width: `${pctOf(done, expected)}%` }} /></div>
    </div>
  );
}

export default async function ReadinessPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requirePage("exams.manage", "marks.approve", "results.view");
  const { id } = await params;
  const q = await searchParams;
  if (!(await prisma.exam.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const data = await loadProgress(id);
  const classFilter = sp(q, "classId");
  const onlyIncomplete = sp(q, "show") === "incomplete";
  const classes = data.classes.filter((c) => !classFilter || c.id === classFilter);
  const t = data.totals;
  const pct = (d: { done: number; expected: number }) => `${pctOf(d.done, d.expected)}%`;

  return (
    <>
      <PageHeader
        title={`Report readiness — ${data.exam.name}`}
        description="What is still missing before report cards are printed: exam marks, Activities of Integration (S1–S4) and comments, per class, stream, subject and teacher."
        actions={<>
          <Button asChild><Link href={`/exams/${id}/missing${classFilter ? `?classId=${classFilter}` : ""}`}>Students missing scores</Link></Button>
          <Button asChild variant="outline"><Link href="/report-cards">Report cards</Link></Button>
          <Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button>
        </>}
      />
      <ScorePicker fields={[
        { name: "classId", label: "Class", placeholder: "All classes", value: classFilter, options: data.classes.map((c) => ({ value: c.id, label: c.name })) },
        { name: "show", label: "Show", placeholder: "Everything", value: onlyIncomplete ? "incomplete" : undefined, options: [{ value: "incomplete", label: "Only what is incomplete" }] },
      ]} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Exam marks entered" value={pct(t.marks)} hint={`${t.marks.done.toLocaleString()} of ${t.marks.expected.toLocaleString()}`} />
        <StatCard label="Activity scores (S1–S4)" value={t.activities.expected ? pct(t.activities) : "—"} hint={`${t.activities.done.toLocaleString()} of ${t.activities.expected.toLocaleString()}${t.activities.missingChapters ? ` · ${t.activities.missingChapters} subject-streams without chapters` : ""}`} />
        <StatCard label="Class-teacher comments" value={pct(t.classTeacher)} hint={`${t.classTeacher.done} of ${t.classTeacher.expected}`} />
        <StatCard label="Head-teacher comments" value={pct(t.headteacher)} hint={`${t.headteacher.done} of ${t.headteacher.expected}`} />
      </div>

      {data.teachersOwing.length > 0 && (
        <Card className="mb-5">
          <CardHeader><CardTitle>Teachers to follow up ({data.teachersOwing.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Teacher</TH><TH>Still missing</TH></tr></THead>
              <tbody>{data.teachersOwing.map((o) => (
                <TR key={o.teacher}>
                  <TD className={`whitespace-nowrap font-medium ${o.teacher.startsWith("(") ? "text-red-700" : ""}`}>{o.teacher}</TD>
                  <TD className="text-xs">{o.items.slice(0, 12).join(" · ")}{o.items.length > 12 ? ` · …and ${o.items.length - 12} more` : ""}</TD>
                </TR>
              ))}</tbody>
            </Table>
          </CardContent>
        </Card>
      )}
      {data.teachersOwing.length === 0 && t.marks.expected > 0 && <Alert tone="success" className="mb-5">All marks{t.activities.expected ? " and activity scores" : ""} are in.</Alert>}

      {classes.map((c) => {
        const rows = c.rows.filter((r) => !onlyIncomplete || r.marksState !== "complete" || (r.actState !== "complete" && r.actState !== "na"));
        return (
          <Card key={c.id} className="mb-5">
            <CardHeader><CardTitle>{c.name}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <THead><tr><TH>Stream</TH><TH>Class teacher</TH><TH>Learners</TH><TH>Class-teacher comments</TH><TH>Head-teacher comments</TH><TH /></tr></THead>
                <tbody>{c.comments.map((s) => {
                  const ct = progressOf(s.classTeacher, s.learners), ht = progressOf(s.headteacher, s.learners);
                  if (onlyIncomplete && ct === "complete" && ht === "complete") return null;
                  return (
                    <TR key={s.streamId}>
                      <TD className="font-medium">{c.code} {c.streams.find((x) => x.id === s.streamId)?.name}</TD>
                      <TD className={s.classTeacherName ? "" : "text-red-700"}>{s.classTeacherName ?? "not set"}</TD>
                      <TD>{s.learners}</TD>
                      <TD><Meter done={s.classTeacher} expected={s.learners} state={ct} /></TD>
                      <TD><Meter done={s.headteacher} expected={s.learners} state={ht} /></TD>
                      <TD><Link className="text-xs text-brand-700 hover:underline" href={`/exams/${id}/comments?streamId=${s.streamId}`}>Comments</Link></TD>
                    </TR>
                  );
                })}</tbody>
              </Table>
              {rows.length === 0 ? <p className="text-sm text-emerald-700">Everything is complete for {c.name}.</p> : (
                <Table>
                  <THead><tr><TH>Stream</TH><TH>Subject</TH><TH>Teacher</TH><TH>Exam marks</TH>{c.oLevel && <TH>Activities (chapters)</TH>}</tr></THead>
                  <tbody>{rows.map((r) => (
                    <TR key={`${r.streamId}:${r.subjectId}`}>
                      <TD className="whitespace-nowrap">{c.code} {c.streams.find((x) => x.id === r.streamId)?.name}</TD>
                      <TD className="font-medium">
                        {r.subject}
                        {(r.marksState !== "complete" || ((r.actState === "partial" || r.actState === "none") && r.chapters !== 0)) && (
                          <Link className="ml-2 text-xs font-normal text-brand-700 hover:underline" href={`/exams/${id}/missing?classId=${c.id}&streamId=${r.streamId}&subjectId=${r.subjectId}`}>who?</Link>
                        )}
                      </TD>
                      <TD className={r.teachers.length ? "text-xs" : "text-xs text-red-700"}>{r.teachers.join(" / ") || "no teacher allocated"}</TD>
                      <TD><Link href={`/exams/${id}/marks?streamId=${r.streamId}&subjectId=${r.subjectId}`} className="block hover:opacity-80"><Meter done={r.marks} expected={r.marksExpected} state={r.marksState} label={r.papers > 1 ? `${r.marks} / ${r.marksExpected} (${r.papers} papers)` : undefined} /></Link></TD>
                      {c.oLevel && (
                        <TD>
                          {r.chapters === 0
                            ? <span className="text-xs font-medium text-red-700">no chapters yet</span>
                            : <Meter done={r.actDone} expected={r.actExpected} state={r.actState} label={`${r.actDone} / ${r.actExpected} (${r.chapters} ch.)`} />}
                        </TD>
                      )}
                    </TR>
                  ))}</tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
