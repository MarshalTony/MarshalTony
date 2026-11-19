import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { comparableExams, loadAnalysis, DEFAULT_OPTIONS } from "@/server/exams/analysis";
import { ScorePicker } from "@/components/score-picker";
import { SimpleBarChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";

export const metadata = { title: "Results analysis" };

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}`);
const tone = (n: number | null, pass: number) => (n === null ? "" : n >= 70 ? "bg-emerald-50 text-emerald-800" : n >= pass ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800");
function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="text-slate-400">—</span>;
  return <span className={d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : "text-slate-500"}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d).toFixed(1)}</span>;
}

export default async function AnalysisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requirePage("results.view", "exams.manage");
  const { id } = await params;
  const q = await searchParams;
  const exam = await prisma.exam.findUnique({ where: { id }, include: { term: true, classes: { include: { schoolClass: true }, orderBy: { schoolClass: { order: "asc" } } } } });
  if (!exam) notFound();
  const classId = exam.classes.find((c) => c.classId === sp(q, "classId"))?.classId ?? exam.classes[0]?.classId;
  if (!classId) return <Alert>No classes in this exam.</Alert>;
  const choices = await comparableExams(id, classId);
  // Default comparison: the most recent other exam from this term or earlier.
  const auto = choices.find((e) => e.term.startDate <= exam.term.startDate) ?? null;
  const compareParam = sp(q, "compareId");
  const compareId = compareParam === "none" ? null : choices.find((e) => e.id === compareParam)?.id ?? auto?.id ?? null;
  const num = (k: string, d: number) => { const v = Number(sp(q, k)); return Number.isFinite(v) && v > 0 ? v : d; };
  const opts = { passMark: num("pass", DEFAULT_OPTIONS.passMark), failLimit: num("fail", DEFAULT_OPTIONS.failLimit), dropLimit: num("drop", DEFAULT_OPTIONS.dropLimit) };
  const a = await loadAnalysis(id, classId, compareId, opts);
  const qs = new URLSearchParams({ examId: id, classId, compareId: compareId ?? "none", pass: String(opts.passMark), fail: String(opts.failLimit), drop: String(opts.dropLimit) });

  const header = (
    <PageHeader
      title={`Results analysis — ${a.cls.name}`}
      description={`${exam.name}${a.compareExam ? ` · compared with ${a.compareExam.name} (${a.compareExam.term.name} ${a.compareExam.term.academicYear.name})` : ""}. Scores are exam percentages.`}
      actions={<>
        <Button asChild variant="outline"><a href={`/api/reports/analysis?${qs}`} target="_blank"><FileText />PDF for staff meeting</a></Button>
        <Button asChild variant="outline"><Link href={`/exams/${id}/results?classId=${classId}`}>Results & broadsheet</Link></Button>
        <Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button>
      </>}
    />
  );
  const picker = (
    <ScorePicker fields={[
      { name: "classId", label: "Class", placeholder: "Class", value: classId, resets: ["compareId"], options: exam.classes.map((c) => ({ value: c.classId, label: c.schoolClass.name })) },
      { name: "compareId", label: "Compare with", placeholder: "Choose exam", value: compareId ?? "none", options: [{ value: "none", label: "No comparison" }, ...choices.map((e) => ({ value: e.id, label: `${e.name} (${e.term.name} ${e.term.academicYear.name})` }))] },
      { name: "pass", label: "Pass mark", placeholder: "Pass mark", value: String(opts.passMark), options: [40, 45, 50, 55, 60].map((n) => ({ value: String(n), label: `${n}%` })) },
      { name: "fail", label: "At risk if below pass in", placeholder: "Subjects", value: String(opts.failLimit), options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}+ subjects` })) },
      { name: "drop", label: "…or dropped by", placeholder: "Points", value: String(opts.dropLimit), options: [5, 10, 15, 20].map((n) => ({ value: String(n), label: `${n}+ points` })) },
    ]} />
  );
  if (!a.summary.candidates) return <>{header}{picker}<Alert tone="warn">No results for {a.cls.name} yet — generate results on the exam page first.</Alert></>;
  const s = a.summary;
  const gradeKeys = Object.keys(s.grades).sort();
  const totalGrades = gradeKeys.reduce((n, g) => n + s.grades[g], 0);

  return (
    <>
      {header}
      {picker}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Candidates" value={s.candidates} />
        <StatCard label="Class average" value={`${pct(s.classAvg)}%`} hint={s.prevClassAvg !== null && s.classAvg !== null ? `${s.classAvg - s.prevClassAvg >= 0 ? "▲" : "▼"} ${Math.abs(s.classAvg - s.prevClassAvg).toFixed(1)} vs ${pct(s.prevClassAvg)}%` : undefined} />
        <StatCard label={`Pass rate (≥ ${opts.passMark}%)`} value={s.passRate === null ? "—" : `${s.passRate}%`} />
        <StatCard label="Boys / girls average" value={`${pct(s.boysAvg)} / ${pct(s.girlsAvg)}`} />
        <StatCard label="Students at risk" value={a.risk.length} hint={a.risk.length ? "see the list below" : undefined} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Stream averages</CardTitle></CardHeader>
          <CardContent><SimpleBarChart title="Average (%) by stream" data={s.streamAvg.map((x) => ({ stream: `${a.cls.code} ${x.name} (${x.n})`, avg: x.avg ?? 0 }))} x="stream" y="avg" unit="%" domainMax={100} height={220} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Grade spread (all subject marks)</CardTitle></CardHeader>
          <CardContent>
            <SimpleBarChart title="Number of subject marks per grade" data={gradeKeys.map((g) => ({ grade: g, n: s.grades[g] }))} x="grade" y="n" height={220} />
            <p className="mt-1 text-xs text-slate-500">{gradeKeys.map((g) => `${g}: ${s.grades[g]} (${Math.round((s.grades[g] / Math.max(1, totalGrades)) * 100)}%)`).join(" · ")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader><CardTitle>Subjects by stream (average %, with subject teacher)</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead><tr>
              <TH>Subject</TH><TH>Sat</TH>{a.streams.map((st) => <TH key={st.id}>{a.cls.code} {st.name}</TH>)}<TH>Overall</TH>{a.compareExam && <TH>Change</TH>}<TH>Boys</TH><TH>Girls</TH>
            </tr></THead>
            <tbody>
              {a.subjects.map((sub) => (
                <TR key={sub.id}>
                  <TD className="font-medium">{sub.name}</TD><TD>{sub.sat}</TD>
                  {sub.byStream.map((c) => (
                    <TD key={c.streamId} className={tone(c.avg, opts.passMark)}>
                      <span className="font-semibold">{pct(c.avg)}</span>
                      <span className="block text-[11px] opacity-80">{c.teachers.join(" / ") || "no teacher"}</span>
                    </TD>
                  ))}
                  <TD className={`font-semibold ${tone(sub.overall, opts.passMark)}`}>{pct(sub.overall)}</TD>
                  {a.compareExam && <TD><Delta d={sub.delta} /></TD>}
                  <TD>{pct(sub.boys)}</TD><TD>{pct(sub.girls)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-slate-500">Colours: green 70% and above, amber {opts.passMark}–69%, red below {opts.passMark}%.</p>
        </CardContent>
      </Card>

      <Card className="mb-5">
        <CardHeader><CardTitle>Teachers (average of the marks in the classes they teach)</CardTitle></CardHeader>
        <CardContent>
          {a.teachers.length === 0 ? <p className="text-sm text-slate-500">No teacher allocations for this class and year (Classes & Subjects → Allocation grid).</p> : (
            <Table>
              <THead><tr><TH>Teacher</TH><TH>Teaches</TH><TH>Marks</TH><TH>Average</TH></tr></THead>
              <tbody>{a.teachers.map((t) => <TR key={t.teacher}><TD className="font-medium">{t.teacher}</TD><TD className="text-xs">{t.teaches}</TD><TD>{t.marks}</TD><TD className={`font-semibold ${tone(t.avg, opts.passMark)}`}>{pct(t.avg)}</TD></TR>)}</tbody>
            </Table>
          )}
          <p className="mt-2 text-xs text-slate-500">For discussion, not judgement: results also depend on the class, the paper and the time of year.</p>
        </CardContent>
      </Card>

      {a.compareExam && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          {([["Most improved", a.improved], ["Biggest drops", a.dropped]] as const).map(([title, list]) => (
            <Card key={title}>
              <CardHeader><CardTitle>{title} since {a.compareExam!.name}</CardTitle></CardHeader>
              <CardContent>
                {list.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
                  <Table>
                    <THead><tr><TH>Student</TH><TH>Stream</TH><TH>Before</TH><TH>Now</TH><TH>Change</TH></tr></THead>
                    <tbody>{list.map((c) => <TR key={c.studentId}><TD><Link className="text-brand-800 hover:underline" href={`/students/${c.studentId}`}>{c.name}</Link></TD><TD>{c.stream}</TD><TD>{pct(c.previous)}</TD><TD>{pct(c.avg)}</TD><TD><Delta d={c.delta} /></TD></TR>)}</tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Students at risk ({a.risk.length})</CardTitle></CardHeader>
        <CardContent>
          {a.risk.length === 0 ? <p className="text-sm text-slate-500">No student meets the at-risk rules.</p> : (
            <Table>
              <THead><tr><TH>Student</TH><TH>Stream</TH><TH>Average</TH><TH>Subjects below {opts.passMark}%</TH>{a.compareExam && <TH>Change</TH>}<TH>Why</TH></tr></THead>
              <tbody>{a.risk.map((r) => (
                <TR key={r.studentId}>
                  <TD><Link className="text-brand-800 hover:underline" href={`/students/${r.studentId}`}>{r.name}</Link></TD><TD>{r.stream}</TD>
                  <TD className={tone(r.avg, opts.passMark)}>{pct(r.avg)}</TD><TD>{r.failed}</TD>{a.compareExam && <TD><Delta d={r.delta} /></TD>}
                  <TD className="text-xs">{r.reasons.join("; ")}</TD>
                </TR>
              ))}</tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
