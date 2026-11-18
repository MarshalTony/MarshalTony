import Link from "next/link";
import { Users, Briefcase, Wallet, AlertTriangle, CheckCircle2, Receipt, ClipboardList, CalendarCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { collections, dailyCollections, kampalaDayRange, totalOutstanding } from "@/server/queries/fees";
import { visibleAnnouncements } from "@/server/queries/announcements";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { PairedBarChart, SimpleBarChart, TrendLineChart } from "@/components/charts";
import { TimetableGrid } from "@/components/timetable-grid";
import { fmtDateTime, ugx } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requirePage();
  const term = await prisma.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  const showSchool = can(user, "students.manage") && can(user, "staff.manage");
  const showFinance = can(user, "fees.view");
  const showAcademic = can(user, "exams.manage", "marks.approve");
  const showTeacher = !!user.staffId && can(user, "marks.enter", "attendance.take");
  const notes = await visibleAnnouncements(user, 4);

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName}`} description={term ? `${term.academicYear.name} · ${term.name} (${term.startDate.toISOString().slice(0, 10)} to ${term.endDate.toISOString().slice(0, 10)})` : "No current term set"} />
      <div className="space-y-6">
        {showSchool && <SchoolSection showActivity={can(user, "audit.view")} />}
        {showFinance && <FinanceSection termStart={term?.startDate} canExpenses={can(user, "finance.view")} />}
        {showAcademic && <AcademicSection termId={term?.id} />}
        {showTeacher && <TeacherSection staffId={user.staffId!} termId={term?.id} />}
        <Card>
          <CardHeader><CardTitle>Announcements</CardTitle><Link href="/announcements" className="text-sm text-brand-700 hover:underline">All</Link></CardHeader>
          <CardContent className="space-y-2">
            {notes.map((n) => <p key={n.id} className="text-sm">{n.isUrgent && <Badge color="red" className="mr-1">Urgent</Badge>}<b>{n.title}</b> — <span className="text-slate-600">{n.body.slice(0, 160)}</span></p>)}
            {notes.length === 0 && <p className="text-sm text-slate-500">No announcements.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

async function SchoolSection({ showActivity }: { showActivity: boolean }) {
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date()) + "T00:00:00Z");
  const [students, staff, byClass, attToday, recent] = await Promise.all([
    prisma.student.groupBy({ by: ["gender"], where: { status: "ACTIVE" }, _count: true }),
    prisma.staff.groupBy({ by: ["isTeaching"], where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, _count: true }),
    prisma.$queryRaw<{ code: string; stream: string; gender: string; n: bigint }[]>`
      SELECT c.code, st.name AS stream, s.gender::text AS gender, COUNT(*)::bigint AS n FROM "Student" s JOIN "SchoolClass" c ON c.id = s."classId" JOIN "Stream" st ON st.id = s."streamId"
      WHERE s.status = 'ACTIVE' GROUP BY c.code, c."order", st.name, s.gender ORDER BY c."order", st.name`,
    prisma.studentAttendance.groupBy({ by: ["status"], where: { date: today }, _count: true }),
    showActivity ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { fullName: true } } } }) : Promise.resolve([]),
  ]);
  const total = students.reduce((a, s) => a + s._count, 0);
  const boys = students.find((s) => s.gender === "MALE")?._count ?? 0;
  const classes = [...new Set(byClass.map((r) => r.code))];
  const genderData = classes.map((c) => ({ cls: c, boys: byClass.filter((r) => r.code === c && r.gender === "MALE").reduce((a, r) => a + Number(r.n), 0), girls: byClass.filter((r) => r.code === c && r.gender === "FEMALE").reduce((a, r) => a + Number(r.n), 0) }));
  const streamData = byClass.reduce<Record<string, number>>((acc, r) => ({ ...acc, [`${r.code} ${r.stream}`]: (acc[`${r.code} ${r.stream}`] ?? 0) + Number(r.n) }), {});
  const marked = attToday.reduce((a, r) => a + r._count, 0);
  const present = attToday.filter((r) => r.status === "PRESENT" || r.status === "LATE").reduce((a, r) => a + r._count, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active students" value={total.toLocaleString()} hint={`${boys} boys · ${total - boys} girls`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Staff" value={staff.reduce((a, s) => a + s._count, 0)} hint={`${staff.find((s) => s.isTeaching)?._count ?? 0} teaching`} icon={<Briefcase className="h-5 w-5" />} />
        <StatCard label="Attendance today" value={marked ? `${((present / marked) * 100).toFixed(0)}%` : "—"} hint={`${marked} students marked`} icon={<CalendarCheck className="h-5 w-5" />} />
        <StatCard label="Streams" value={Object.keys(streamData).length} hint={`${classes.length} classes`} icon={<ClipboardList className="h-5 w-5" />} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardContent><PairedBarChart title="Students by class and gender" data={genderData} x="cls" series={[{ key: "boys", label: "Boys" }, { key: "girls", label: "Girls" }]} /></CardContent></Card>
        <Card><CardContent><SimpleBarChart title="Students per stream" data={Object.entries(streamData).map(([k, v]) => ({ stream: k, n: v }))} x="stream" y="n" /></CardContent></Card>
      </div>
      {showActivity && <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent>
          <Table><tbody>{recent.map((r) => <TR key={r.id}><TD className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</TD><TD className="text-xs">{r.user?.fullName ?? "system"}</TD><TD className="text-xs">{r.action.replaceAll("_", " ").toLowerCase()} · {r.entity}</TD></TR>)}</tbody></Table>
        </CardContent>
      </Card>}
    </>
  );
}

async function FinanceSection({ termStart, canExpenses }: { termStart?: Date; canExpenses: boolean }) {
  const t = kampalaDayRange();
  const [today, termC, out, trend, pendingVouchers, spent] = await Promise.all([
    collections(t.start, t.end),
    termStart ? collections(termStart, new Date(Date.now() + 86400_000)) : Promise.resolve({ amount: 0, count: 0 }),
    totalOutstanding(),
    dailyCollections(14),
    canExpenses ? prisma.expense.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    canExpenses && termStart ? prisma.expense.aggregate({ where: { status: "PAID", date: { gte: termStart } }, _sum: { amount: true } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fees collected today" value={ugx(today.amount)} hint={`${today.count} receipts`} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="Collected this term" value={ugx(termC.amount)} icon={<Receipt className="h-5 w-5" />} />
        <StatCard label="Outstanding fees" value={ugx(out.owed)} hint={`${out.debtors} students`} icon={<AlertTriangle className="h-5 w-5" />} />
        {canExpenses ? <StatCard label="Expenditure this term" value={ugx(spent?._sum.amount ?? 0)} hint={`${pendingVouchers} voucher(s) awaiting approval`} icon={<CheckCircle2 className="h-5 w-5" />} /> : <StatCard label="Prepaid credit" value={ugx(out.credit)} />}
      </div>
      <Card><CardContent><TrendLineChart title="Daily fees collections — last 14 days (UGX)" data={trend} x="day" y="amount" money /></CardContent></Card>
    </>
  );
}

async function AcademicSection({ termId }: { termId?: string }) {
  const [subs, latest, open] = await Promise.all([
    prisma.markSubmission.groupBy({ by: ["status"], where: { exam: { termId } }, _count: true }),
    prisma.exam.findFirst({ where: { resultsGeneratedAt: { not: null } }, orderBy: { resultsGeneratedAt: "desc" } }),
    prisma.exam.findMany({ where: { termId, status: "OPEN" }, select: { id: true, name: true } }),
  ]);
  const classAvg = latest ? await prisma.$queryRaw<{ code: string; avg: number }[]>`
    SELECT c.code, AVG(r.average)::float AS avg FROM "ExamResult" r JOIN "SchoolClass" c ON c.id = r."classId" WHERE r."examId" = ${latest.id} AND r."classPosition" IS NOT NULL GROUP BY c.code, c."order" ORDER BY c."order"` : [];
  const subjAvg = latest ? await prisma.$queryRaw<{ name: string; avg: number }[]>`
    SELECT COALESCE(s."shortName", s.code) AS name, AVG(sr.percentage)::float AS avg FROM "SubjectResult" sr JOIN "Subject" s ON s.id = sr."subjectId" WHERE sr."examId" = ${latest.id} AND sr.percentage IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 16` : [];
  const c = (k: string) => subs.find((s) => s.status === k)?._count ?? 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Exams open for marks" value={open.length} hint={open.map((o) => o.name).join(", ").slice(0, 60)} />
        <StatCard label="Mark sheets in draft" value={c("DRAFT") + c("REJECTED")} hint={`${c("REJECTED")} returned`} />
        <StatCard label="Awaiting approval" value={c("SUBMITTED")} hint={<Link href="/exams" className="text-brand-700 underline">Review</Link>} />
        <StatCard label="Approved" value={c("APPROVED")} />
      </div>
      {latest && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardContent><SimpleBarChart title={`Class average — ${latest.name} (%)`} data={classAvg.map((r) => ({ cls: r.code, avg: Math.round(r.avg * 10) / 10 }))} x="cls" y="avg" unit="%" domainMax={100} /></CardContent></Card>
          <Card><CardContent><SimpleBarChart title={`Subject average — ${latest.name} (%)`} data={subjAvg.map((r) => ({ s: r.name, avg: Math.round(r.avg * 10) / 10 }))} x="s" y="avg" unit="%" domainMax={100} /></CardContent></Card>
        </div>
      )}
    </>
  );
}

async function TeacherSection({ staffId, termId }: { staffId: string; termId?: string }) {
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  const [allocs, classTeacherOf, slots, openExams] = await Promise.all([
    prisma.teacherAllocation.findMany({ where: { staffId, academicYear: { isCurrent: true } }, include: { subject: true, stream: { include: { schoolClass: true } } }, orderBy: [{ stream: { schoolClass: { order: "asc" } } }] }),
    prisma.stream.findMany({ where: { classTeacherId: staffId }, include: { schoolClass: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } } }),
    termId ? prisma.timetableSlot.findMany({ where: { termId, staffId }, include: { subject: true, stream: { include: { schoolClass: true } } } }) : [],
    prisma.exam.findMany({ where: { termId, status: "OPEN", isComposite: false }, include: { submissions: true } }),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>My classes & marks entry</CardTitle><Link href="/exams" className="text-sm text-brand-700 hover:underline">Examinations</Link></CardHeader>
        <CardContent>
          {classTeacherOf.length > 0 && <p className="mb-2 text-sm">Class teacher of: {classTeacherOf.map((s) => <Badge key={s.id} color="green" className="mr-1">{s.schoolClass.code} {s.name} ({s._count.students})</Badge>)}</p>}
          <Table>
            <THead><tr><TH>Subject</TH><TH>Stream</TH>{openExams.map((e) => <TH key={e.id}>{e.name.slice(0, 18)}</TH>)}</tr></THead>
            <tbody>
              {allocs.map((a) => (
                <TR key={a.id}>
                  <TD>{a.subject.name}</TD><TD>{a.stream.schoolClass.code} {a.stream.name}</TD>
                  {openExams.map((e) => <TD key={e.id}><Link href={`/exams/${e.id}/marks?streamId=${a.streamId}&subjectId=${a.subjectId}`}><StatusBadge status={e.submissions.find((s) => s.streamId === a.streamId && s.subjectId === a.subjectId)?.status ?? "NOT STARTED"} /></Link></TD>)}
                </TR>
              ))}
              {allocs.length === 0 && <TR><TD colSpan={2} className="text-slate-500">No subject allocations this year.</TD></TR>}
            </tbody>
          </Table>
          <div className="mt-3 flex gap-3 text-sm"><Link href="/attendance" className="text-brand-700 underline">Take attendance</Link><Link href="/learning" className="text-brand-700 underline">Assignments</Link></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>My timetable</CardTitle></CardHeader>
        <CardContent>
          <TimetableGrid title="you" slots={slots.map((s) => ({ id: s.id, day: s.dayOfWeek, start: s.startTime, end: s.endTime, title: s.subject?.name ?? s.label ?? "", sub: `${s.stream.schoolClass.code} ${s.stream.name}${s.dayOfWeek === dow ? " · today" : ""}` }))} />
        </CardContent>
      </Card>
    </div>
  );
}
