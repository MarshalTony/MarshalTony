import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Download, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { loadRule } from "@/server/exams/results";
import { topN, analyseSubjects, groupBy } from "@/lib/exams/engine";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { SimpleBarChart } from "@/components/charts";
import { ordinal, studentName } from "@/lib/utils";

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requirePage("results.view");
  const { id } = await params;
  const q = await searchParams;
  const exam = await prisma.exam.findUnique({ where: { id }, include: { classes: { include: { schoolClass: { include: { streams: { orderBy: { name: "asc" } } } } }, orderBy: { schoolClass: { order: "asc" } } } } });
  if (!exam) notFound();
  const classId = sp(q, "classId") ?? exam.classes[0]?.classId;
  const cls = exam.classes.find((c) => c.classId === classId)?.schoolClass;
  if (!cls) return <Alert>No classes in this exam.</Alert>;
  const streamId = sp(q, "streamId");
  const [rule, results, subjectResults, examSubjects] = await Promise.all([
    loadRule(cls.level),
    prisma.examResult.findMany({ where: { examId: id, classId }, include: { student: { include: { stream: true } } }, orderBy: [{ classPosition: { sort: "asc", nulls: "last" } }, { student: { lastName: "asc" } }] }),
    prisma.subjectResult.findMany({ where: { examId: id, student: { classId } } }),
    prisma.examSubject.findMany({ where: { examId: id, classId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
  ]);
  if (!results.length) return <><PageHeader title={`Results — ${exam.name}`} /><Alert tone="warn">Results have not been generated for {cls.name}. Generate them on the exam page.</Alert></>;
  const rows = streamId ? results.filter((r) => r.streamId === streamId) : results;
  const bySubject = groupBy(subjectResults, (s) => `${s.studentId}:${s.subjectId}`);
  const subjectName = new Map(examSubjects.map((e) => [e.subjectId, e.subject.shortName ?? e.subject.code]));
  const ranked = results.filter((r) => r.classPosition !== null);
  const classAvg = ranked.length ? ranked.reduce((a, r) => a + Number(r.average), 0) / ranked.length : 0;
  const best = topN(results.map((r) => ({ ...r, position: r.classPosition })), rule.topClassCount);
  const byStream = groupBy(results, (r) => r.streamId);
  const analysis = analyseSubjects(
    [...groupBy(subjectResults, (s) => s.studentId).entries()].map(([studentId, subs]) => ({
      studentId, classId, streamId: "", subjectsCount: 0, total: 0, average: 0, points: 0, aggregate: null, division: null, rankValue: null,
      classPosition: null, classSize: 0, streamPosition: null, streamSize: 0,
      subjects: subs.map((s) => ({ subjectId: s.subjectId, state: s.status as any, score: s.score === null ? null : Number(s.score), percentage: s.percentage === null ? null : Number(s.percentage), grade: s.grade, points: s.points === null ? null : Number(s.points), remark: s.remark, counted: s.percentage !== null, position: s.subjectPosition, size: s.subjectSize })),
    })),
  ).sort((a, b) => b.average - a.average);
  const basisLabel = { AVERAGE: "Average %", TOTAL: "Total", POINTS: "Points", AGGREGATE: `Aggregate (best ${rule.bestOfSubjects})` }[rule.rankingBasis];
  const rankVal = (r: (typeof results)[number]) => rule.rankingBasis === "AGGREGATE" ? r.aggregate ?? "—" : rule.rankingBasis === "POINTS" ? Number(r.points ?? 0) : rule.rankingBasis === "TOTAL" ? Number(r.total) : `${Number(r.average).toFixed(2)}%`;
  const base = `/api/reports/broadsheet?examId=${id}&classId=${classId}${streamId ? `&streamId=${streamId}` : ""}`;
  // Score sheet = what the report cards show (S1–S4: activities /20 + exam /80), for the class or the chosen stream.
  const sheet = `/api/reports/scoresheet?examId=${id}&classId=${classId}${streamId ? `&streamId=${streamId}` : ""}`;
  return (
    <>
      <PageHeader title={`Results — ${cls.name}`} description={`${exam.name} · ranked by ${basisLabel.toLowerCase()} · ties share a position`} actions={
        <>
          <Button asChild variant="outline"><Link href={`/exams/${id}`}>Back to exam</Link></Button>
          <Button asChild><Link href={`/exams/${id}/analysis?classId=${classId}`}><BarChart3 />Analysis</Link></Button>
          <Button asChild><a href={`${sheet}&format=pdf`} target="_blank"><FileText />Score sheet PDF</a></Button>
          <Button asChild variant="outline"><a href={`${sheet}&format=xlsx`}><Download />Score sheet Excel</a></Button>
          <Button asChild variant="outline"><a href={`${sheet}&format=pdf&sort=name`} target="_blank"><FileText />Score sheet A–Z</a></Button>
          <Button asChild variant="ghost"><a href={`${base}&format=xlsx`}><Download />Exam marks only (Excel)</a></Button>
        </>
      } />
      <FilterBar filters={[
        { name: "classId", label: "Class", allowAll: false, value: classId, options: exam.classes.map((c) => ({ value: c.classId, label: c.schoolClass.name })) },
        { name: "streamId", label: "Stream", options: cls.streams.map((s) => ({ value: s.id, label: `${cls.code} ${s.name}` })) },
      ]} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Candidates" value={results.length} hint={`${ranked.length} ranked`} />
        <StatCard label="Class average" value={`${classAvg.toFixed(1)}%`} />
        <StatCard label="Best student" value={best[0] ? studentName(best[0].student) : "—"} hint={best[0] ? `${rankVal(best[0])}` : undefined} />
        <StatCard label="Subjects" value={examSubjects.length} />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Best {rule.topClassCount} in {cls.name}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Pos.</TH><TH>Student</TH><TH>Stream</TH><TH>{basisLabel}</TH></tr></THead>
              <tbody>{best.map((r) => <TR key={r.id}><TD className="font-semibold">{ordinal(r.classPosition)}</TD><TD>{studentName(r.student)}</TD><TD>{r.student.stream.name}</TD><TD>{rankVal(r)}</TD></TR>)}</tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Best {rule.topStreamCount} in each stream</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {cls.streams.filter((s) => byStream.has(s.id)).map((s) => (
              <div key={s.id}>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{cls.code} {s.name}</p>
                <Table>
                  <tbody>
                    {topN(byStream.get(s.id)!.map((r) => ({ ...r, position: r.streamPosition })), rule.topStreamCount).map((r) => (
                      <TR key={r.id}><TD className="w-14 font-semibold">{ordinal(r.streamPosition)}</TD><TD>{studentName(r.student)}</TD><TD className="text-right">{rankVal(r)}</TD></TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mb-5">
        <CardHeader><CardTitle>Subject performance</CardTitle></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <SimpleBarChart title="Average score by subject (%)" data={analysis.map((a) => ({ subject: subjectName.get(a.subjectId) ?? "?", avg: a.average }))} x="subject" y="avg" unit="%" domainMax={100} height={280} bands={{}} />
          <Table>
            <THead><tr><TH>Subject</TH><TH>Sat</TH><TH>Average</TH><TH>Highest</TH><TH>Lowest</TH><TH>Grades</TH></tr></THead>
            <tbody>
              {analysis.map((a) => (
                <TR key={a.subjectId}>
                  <TD>{examSubjects.find((e) => e.subjectId === a.subjectId)?.subject.name}</TD><TD>{a.candidates}</TD>
                  <TD className="font-medium">{a.average.toFixed(1)}%</TD><TD>{a.highest.toFixed(0)}</TD><TD>{a.lowest.toFixed(0)}</TD>
                  <TD className="text-xs">{Object.entries(a.gradeCounts).sort().map(([g, n]) => `${g}:${n}`).join(" ")}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Broadsheet {streamId ? `(${cls.code} ${cls.streams.find((s) => s.id === streamId)?.name})` : ""}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <tr>
                <TH>Pos.</TH><TH>Student</TH><TH>Str.</TH>
                {examSubjects.map((e) => <TH key={e.subjectId} className="text-center">{subjectName.get(e.subjectId)}</TH>)}
                <TH>Total</TH><TH>Avg</TH><TH>{rule.rankingBasis === "AGGREGATE" ? "Agg" : "Pts"}</TH>{rule.divisions.length > 0 && <TH>Div</TH>}<TH>Str. pos</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-semibold">{r.classPosition ?? "—"}</TD>
                  <TD className="whitespace-nowrap"><Link href={`/students/${r.studentId}`} className="hover:underline">{studentName(r.student)}</Link></TD>
                  <TD>{r.student.stream.name}</TD>
                  {examSubjects.map((e) => {
                    const s = bySubject.get(`${r.studentId}:${e.subjectId}`)?.[0];
                    return <TD key={e.subjectId} className="whitespace-nowrap text-center text-xs">{!s ? "" : s.percentage !== null ? <>{Number(s.percentage).toFixed(0)} <b>{s.grade}</b></> : <span className="text-slate-400">{s.grade ?? "—"}</span>}</TD>;
                  })}
                  <TD>{Number(r.total)}</TD><TD>{Number(r.average).toFixed(1)}</TD>
                  <TD>{rule.rankingBasis === "AGGREGATE" ? r.aggregate ?? "—" : Number(r.points ?? 0)}</TD>
                  {rule.divisions.length > 0 && <TD>{r.division ?? "—"}</TD>}
                  <TD>{r.streamPosition ?? "—"}/{r.streamSize}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-slate-500">ABS = absent, EX = exempted, — = mark not entered. Unranked students have fewer than {rule.minSubjectsToRank} graded subject(s).</p>
        </CardContent>
      </Card>
    </>
  );
}
