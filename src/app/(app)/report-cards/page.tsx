import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { FileText } from "lucide-react";
import { ordinal, studentName } from "@/lib/utils";

export const metadata = { title: "Report cards" };

export default async function ReportCardsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("reportcards.generate");
  const params = await searchParams;
  const exams = await prisma.exam.findMany({
    where: { resultsGeneratedAt: { not: null } }, include: { term: { include: { academicYear: true } }, classes: { include: { schoolClass: { include: { streams: { orderBy: { name: "asc" } } } } } } },
    orderBy: [{ term: { startDate: "desc" } }, { createdAt: "desc" }],
  });
  const exam = exams.find((e) => e.id === sp(params, "examId")) ?? exams[0];
  const streams = exam ? exam.classes.flatMap((c) => c.schoolClass.streams.map((s) => ({ id: s.id, label: `${c.schoolClass.code} ${s.name}` }))) : [];
  const streamId = sp(params, "streamId");
  const results = exam && streamId ? await prisma.examResult.findMany({ where: { examId: exam.id, streamId }, include: { student: true }, orderBy: { streamPosition: { sort: "asc", nulls: "last" } } }) : [];
  return (
    <>
      <PageHeader title="Report cards" description="Individual and bulk PDF report cards. Historical exams remain available. Configure the layout in Settings → School profile." />
      {!exam ? <Alert>No examination has generated results yet.</Alert> : (
        <>
          <FilterBar filters={[
            { name: "examId", label: "Exam", allowAll: false, value: exam.id, options: exams.map((e) => ({ value: e.id, label: `${e.term.academicYear.name} ${e.term.name} — ${e.name}` })) },
            { name: "streamId", label: "Stream", options: streams.map((s) => ({ value: s.id, label: s.label })) },
          ]} />
          <Card className="mb-5">
            <CardHeader><CardTitle>{exam.name}</CardTitle><StatusBadge status={exam.status} /></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {exam.classes.map((c) => (
                <Button key={c.classId} asChild variant="outline" size="sm"><a href={`/api/pdf/report-card?examId=${exam.id}&classId=${c.classId}`} target="_blank"><FileText />All {c.schoolClass.name}</a></Button>
              ))}
              {streams.map((s) => (
                <Button key={s.id} asChild variant="secondary" size="sm"><a href={`/api/pdf/report-card?examId=${exam.id}&streamId=${s.id}`} target="_blank"><FileText />{s.label}</a></Button>
              ))}
            </CardContent>
          </Card>
          {streamId && (
            <Table>
              <THead><tr><TH>Pos.</TH><TH>Student</TH><TH>Average</TH><TH /></tr></THead>
              <tbody>
                {results.map((r) => (
                  <TR key={r.id}>
                    <TD>{ordinal(r.streamPosition)}</TD><TD>{studentName(r.student)}</TD><TD>{Number(r.average).toFixed(1)}%</TD>
                    <TD className="text-right"><a className="text-sm text-brand-700 hover:underline" href={`/api/pdf/report-card?examId=${exam.id}&studentId=${r.studentId}`} target="_blank">Report card</a></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
