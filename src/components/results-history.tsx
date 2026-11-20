import { prisma } from "@/lib/db";
import { reportScores } from "@/server/exams/report-scores";
import { TrendLineChart } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { ordinal } from "@/lib/utils";

const tone = (n: number | null) => (n === null ? "" : n >= 70 ? "bg-emerald-50 text-emerald-800" : n >= 50 ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800");
const short = (code: string, term: number, year: string) => `T${term} ${code} ${year}`;

/**
 * Student profile → Results history: every exam with results, oldest first for the chart, newest first in the table.
 * Averages and subject scores are as printed on the report card (all subjects; S1–S4 include activities).
 */
export async function ResultsHistory({ studentId, canPrint }: { studentId: string; canPrint: boolean }) {
  const results = await prisma.examResult.findMany({
    where: { studentId, exam: { isComposite: false } },
    include: { exam: { include: { examType: true, term: { include: { academicYear: true } } } } },
  });
  results.sort((a, b) => a.exam.term.startDate.getTime() - b.exam.term.startDate.getTime() || a.exam.examType.order - b.exam.examType.order);
  const rows = await Promise.all(results.map(async (r) => {
    const sc = (await reportScores(r.examId, [studentId])).byStudent.get(studentId);
    return { r, avg: sc?.average ?? null, grade: sc?.grade ?? null, subjects: new Map((sc?.subjects ?? []).map((x) => [x.subjectId, x.score])) };
  }));
  const withAvg = rows.filter((x) => x.avg !== null);
  const change = (i: number) => {
    const cur = rows[i].avg; const prev = rows.slice(0, i).reverse().find((x) => x.avg !== null)?.avg ?? null;
    return cur === null || prev === null ? null : Math.round((cur - prev) * 10) / 10;
  };
  const recent = rows.slice(-6);
  const subjectIds = [...new Set(recent.flatMap((x) => [...x.subjects.keys()]))];
  const subjects = subjectIds.length ? await prisma.subject.findMany({ where: { id: { in: subjectIds } }, orderBy: [{ reportOrder: "asc" }, { name: "asc" }] }) : [];

  return (
    <Card>
      <CardHeader><CardTitle>Results history</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? <p className="text-sm text-slate-500">No results yet.</p> : (
          <>
            {withAvg.length > 1 && (
              <TrendLineChart title="Average across all subjects (%)" height={200}
                data={withAvg.map((x) => ({ exam: short(x.r.exam.examType.code, x.r.exam.term.number, x.r.exam.term.academicYear.name), avg: x.avg ?? 0 }))} x="exam" y="avg" />
            )}
            <Table>
              <THead><tr><TH>Exam</TH><TH>Average</TH><TH>Grade</TH><TH>Change</TH><TH>Class pos.</TH><TH>Stream pos.</TH><TH /></tr></THead>
              <tbody>
                {rows.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => {
                  const d = change(i);
                  return (
                    <TR key={x.r.id}>
                      <TD>{x.r.exam.name}<p className="text-xs text-slate-500">{x.r.exam.term.academicYear.name} {x.r.exam.term.name}</p></TD>
                      <TD className={`font-semibold ${tone(x.avg)}`}>{x.avg === null ? "—" : `${x.avg.toFixed(1)}%`}</TD>
                      <TD>{x.grade ?? "—"}</TD>
                      <TD>{d === null ? <span className="text-slate-400">—</span> : <span className={d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : "text-slate-500"}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d).toFixed(1)}</span>}</TD>
                      <TD>{x.r.classPosition ? `${ordinal(x.r.classPosition)} / ${x.r.classSize}` : "—"}</TD>
                      <TD>{x.r.streamPosition ? `${ordinal(x.r.streamPosition)} / ${x.r.streamSize}` : "—"}</TD>
                      <TD>{canPrint && <a className="text-sm text-brand-700 hover:underline" href={`/api/pdf/report-card?examId=${x.r.examId}&studentId=${studentId}`} target="_blank">Report card</a>}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            {subjects.length > 0 && (
              <div className="overflow-x-auto">
                <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Subject by subject (last {recent.length} exam{recent.length === 1 ? "" : "s"})</p>
                <Table>
                  <THead><tr><TH>Subject</TH>{recent.map((x) => <TH key={x.r.id} className="whitespace-nowrap">{short(x.r.exam.examType.code, x.r.exam.term.number, x.r.exam.term.academicYear.name)}</TH>)}</tr></THead>
                  <tbody>{subjects.map((sub) => (
                    <TR key={sub.id}>
                      <TD className="font-medium">{sub.name}</TD>
                      {recent.map((x) => { const v = x.subjects.get(sub.id) ?? null; return <TD key={x.r.id} className={tone(v)}>{v === null ? "—" : Math.round(v)}</TD>; })}
                    </TR>
                  ))}</tbody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
