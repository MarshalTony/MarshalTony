/* eslint-disable @next/next/no-img-element */
import { FileText, Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "./ui/button";
import { Badge, Card, CardContent, CardHeader, CardTitle, DL, StatusBadge } from "./ui/card";
import { Table, THead, TH, TR, TD } from "./data-table";
import { TimetableGrid } from "./timetable-grid";
import { withRunningBalance } from "@/lib/fees";
import { fmtDate, ordinal, studentName, ugx } from "@/lib/utils";

/** Read-only view of one student for the parent and student portals. Only PUBLISHED exams are shown. */
export async function PortalStudentView({ studentId, showLearning }: { studentId: string; showLearning?: boolean }) {
  const term = await prisma.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  const s = await prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { schoolClass: true, stream: { include: { classTeacher: true } }, combination: true } });
  const [results, ledger, payments, att, slots, assignments, materials] = await Promise.all([
    prisma.examResult.findMany({ where: { studentId, exam: { status: "PUBLISHED" } }, include: { exam: { include: { term: { include: { academicYear: true } } } } }, orderBy: { computedAt: "desc" } }),
    prisma.ledgerEntry.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } }),
    prisma.payment.findMany({ where: { studentId }, include: { method: true, reversal: true }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] }),
    term ? prisma.studentAttendance.groupBy({ by: ["status"], where: { studentId, date: { gte: term.startDate, lte: term.endDate } }, _count: true }) : [],
    term ? prisma.timetableSlot.findMany({ where: { termId: term.id, streamId: s.streamId }, include: { subject: true, staff: true } }) : [],
    showLearning ? prisma.assignment.findMany({ where: { streamId: s.streamId }, include: { subject: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    showLearning ? prisma.learningMaterial.findMany({ where: { classId: s.classId }, include: { subject: true }, orderBy: { createdAt: "desc" }, take: 30 }) : [],
  ]);
  const latest = results[0];
  const subjects = latest ? await prisma.subjectResult.findMany({ where: { examId: latest.examId, studentId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }) : [];
  const rows = withRunningBalance(ledger);
  const balance = rows.length ? rows[rows.length - 1].balance : 0;
  const a = (k: string) => att.find((x) => x.status === k)?._count ?? 0;
  const days = a("PRESENT") + a("LATE") + a("ABSENT") + a("EXCUSED");
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>{studentName(s)}</CardTitle><StatusBadge status={s.status} /></CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          {s.photoFileId && <img src={`/api/files/${s.photoFileId}`} alt="" className="h-28 w-24 rounded border object-cover" />}
          <DL cols={3} items={[
            ["Admission no.", s.admissionNo], ["Class", `${s.schoolClass.name} ${s.stream.name}`], ["Combination", s.combination?.code ?? "—"],
            ["Class teacher", s.stream.classTeacher ? `${s.stream.classTeacher.firstName} ${s.stream.classTeacher.lastName}` : "—"],
            ["Day / boarding", s.residence === "DAY" ? "Day" : "Boarding"], ["Term", term ? `${term.academicYear.name} ${term.name} (ends ${fmtDate(term.endDate)})` : "—"],
          ]} />
        </CardContent>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>School fees</CardTitle><Button asChild size="sm" variant="outline"><a href={`/api/pdf/statement/${s.id}`} target="_blank"><Download />Statement</a></Button></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>{ugx(balance)}</p>
            <p className="mb-3 text-xs text-slate-500">{balance > 0 ? "Outstanding balance" : balance < 0 ? "Credit on account" : "Fully paid"}</p>
            <Table>
              <THead><tr><TH>Date</TH><TH>Receipt</TH><TH className="text-right">Amount</TH></tr></THead>
              <tbody>
                {payments.slice(0, 8).map((p) => (
                  <TR key={p.id}><TD className="text-xs">{fmtDate(p.paidAt)}</TD><TD className="text-xs"><a href={`/api/pdf/receipt/${p.id}`} target="_blank" className="text-brand-700 underline">{p.receiptNo}</a> {p.reversal && <Badge color="red">reversed</Badge>}</TD><TD className="text-right">{ugx(p.amount)}</TD></TR>
                ))}
                {payments.length === 0 && <TR><TD colSpan={3} className="text-slate-500">No payments yet.</TD></TR>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Attendance this term</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-brand-800">{days ? `${(((a("PRESENT") + a("LATE")) / days) * 100).toFixed(0)}%` : "—"}</p>
            <p className="mb-3 text-xs text-slate-500">{days} school day(s) recorded</p>
            <div className="grid grid-cols-2 gap-2 text-sm"><span>Present: <b>{a("PRESENT")}</b></span><span>Late: <b>{a("LATE")}</b></span><span>Absent: <b>{a("ABSENT")}</b></span><span>Excused: <b>{a("EXCUSED")}</b></span></div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Examination results</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {latest ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm"><b>{latest.exam.name}</b> · average <b>{Number(latest.average).toFixed(1)}%</b> · class position <b>{latest.classPosition ? `${ordinal(latest.classPosition)} of ${latest.classSize}` : "—"}</b> · stream <b>{latest.streamPosition ? `${ordinal(latest.streamPosition)} of ${latest.streamSize}` : "—"}</b></p>
                <Button asChild size="sm"><a href={`/api/pdf/report-card?examId=${latest.examId}&studentId=${s.id}`} target="_blank"><FileText />Report card</a></Button>
              </div>
              <Table>
                <THead><tr><TH>Subject</TH><TH>%</TH><TH>Grade</TH><TH>Position</TH><TH>Remark</TH></tr></THead>
                <tbody>{subjects.map((x) => <TR key={x.id}><TD>{x.subject.name}</TD><TD>{x.percentage !== null ? Number(x.percentage).toFixed(0) : "—"}</TD><TD className="font-semibold">{x.grade ?? "—"}</TD><TD>{x.subjectPosition ? `${x.subjectPosition}/${x.subjectSize}` : "—"}</TD><TD className="text-xs">{x.remark}</TD></TR>)}</tbody>
              </Table>
              {results.length > 1 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Earlier report cards</p>
                  <div className="flex flex-wrap gap-2">{results.slice(1).map((r) => <a key={r.id} className="rounded border border-slate-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50" href={`/api/pdf/report-card?examId=${r.examId}&studentId=${s.id}`} target="_blank">{r.exam.term.academicYear.name} {r.exam.term.name} — {r.exam.name}</a>)}</div>
                </div>
              )}
            </>
          ) : <p className="text-sm text-slate-500">No results have been published yet.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Class timetable</CardTitle></CardHeader>
        <CardContent><TimetableGrid title={`${s.schoolClass.code} ${s.stream.name}`} slots={slots.map((x) => ({ id: x.id, day: x.dayOfWeek, start: x.startTime, end: x.endTime, title: x.subject?.name ?? x.label ?? "", sub: x.room ?? "" }))} /></CardContent>
      </Card>
      {showLearning && (
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {assignments.map((x) => <div key={x.id} className="rounded border border-slate-200 p-2 text-sm"><p className="font-medium">{x.title}</p><p className="text-xs text-slate-500">{x.subject.name}{x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ""}</p><p className="mt-1 whitespace-pre-wrap">{x.description}</p>{x.fileId && <a href={`/api/files/${x.fileId}`} className="text-xs text-brand-700 underline" target="_blank">Attachment</a>}</div>)}
              {assignments.length === 0 && <p className="text-sm text-slate-500">No assignments.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Learning materials</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {materials.map((x) => <div key={x.id} className="text-sm"><p className="font-medium">{x.title} <span className="text-xs font-normal text-slate-500">· {x.subject.name}</span></p>{x.fileId && <a href={`/api/files/${x.fileId}`} className="text-xs text-brand-700 underline" target="_blank">Open file</a>} {x.url && <a href={x.url} className="text-xs text-brand-700 underline" target="_blank" rel="noopener noreferrer">Open link</a>}</div>)}
              {materials.length === 0 && <p className="text-sm text-slate-500">No materials.</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
