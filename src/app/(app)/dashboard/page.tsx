import Link from "next/link";
import { Users, Briefcase, Wallet, AlertTriangle, CheckCircle2, Circle, Receipt, ClipboardList, CalendarCheck, ListChecks } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { collections, dailyCollections, kampalaDayRange, totalOutstanding } from "@/server/queries/fees";
import { visibleAnnouncements } from "@/server/queries/announcements";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { PairedBarChart, SimpleBarChart, TrendLineChart } from "@/components/charts";
import { TimetableGrid } from "@/components/timetable-grid";
import { ProgressMeter } from "@/components/progress-meter";
import { loadClassTeacher, loadSetupChecklist, loadTeacherSheets } from "@/server/dashboard";
import { loadProgress } from "@/server/exams/progress";
import { progressOf } from "@/lib/exams/progress";
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
        {can(user, "settings.manage") && <SetupChecklist />}
        {showTeacher && <TeacherSection staffId={user.staffId!} termId={term?.id} />}
        {showAcademic && <AcademicSection termId={term?.id} />}
        {showSchool && <SchoolSection showActivity={can(user, "audit.view")} />}
        {showFinance && <FinanceSection termStart={term?.startDate} canExpenses={can(user, "finance.view")} />}
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

/** Administrator: what is still missing to run the school in the system. Hidden once everything is done. */
async function SetupChecklist() {
  const items = await loadSetupChecklist();
  const todo = items.filter((i) => !i.done);
  if (!todo.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-brand-700" />Getting the school ready <span className="text-sm font-normal text-slate-500">{items.length - todo.length} of {items.length} done</span></CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 h-2 w-full rounded-full bg-slate-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.round(((items.length - todo.length) / items.length) * 100)}%` }} /></div>
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className={`flex items-start gap-2 rounded-md border p-2.5 text-sm hover:border-brand-400 ${i.done ? "border-slate-100 bg-slate-50 text-slate-500" : "border-amber-200 bg-amber-50/50"}`}>
                {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <span><span className={`block font-medium ${i.done ? "" : "text-slate-900"}`}>{i.title}</span><span className="block text-xs">{i.detail}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** DOS / headteacher: every exam of the term with how far marks, activity scores and comments are. */
async function AcademicSection({ termId }: { termId?: string }) {
  const [exams, latest] = await Promise.all([
    termId ? prisma.exam.findMany({ where: { termId, isComposite: false }, include: { examType: true }, orderBy: [{ examType: { order: "asc" } }, { createdAt: "asc" }] }) : Promise.resolve([]),
    prisma.exam.findFirst({ where: { resultsGeneratedAt: { not: null } }, orderBy: { resultsGeneratedAt: "desc" } }),
  ]);
  const progress = await Promise.all(exams.map(async (e) => ({ e, t: (await loadProgress(e.id)).totals })));
  const classAvg = latest ? await prisma.$queryRaw<{ code: string; avg: number }[]>`
    SELECT c.code, AVG(r.average)::float AS avg FROM "ExamResult" r JOIN "SchoolClass" c ON c.id = r."classId" WHERE r."examId" = ${latest.id} AND r."classPosition" IS NOT NULL GROUP BY c.code, c."order" ORDER BY c."order"` : [];
  const subjAvg = latest ? await prisma.$queryRaw<{ name: string; avg: number }[]>`
    SELECT COALESCE(s."shortName", s.code) AS name, AVG(sr.percentage)::float AS avg FROM "SubjectResult" sr JOIN "Subject" s ON s.id = sr."subjectId" WHERE sr."examId" = ${latest.id} AND sr.percentage IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 16` : [];
  const meter = (d: { done: number; expected: number }) => <ProgressMeter done={d.done} expected={d.expected} state={progressOf(d.done, d.expected)} label={d.expected ? `${d.done.toLocaleString()} / ${d.expected.toLocaleString()}` : "—"} />;
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Examinations this term</CardTitle><Link href="/exams" className="text-sm text-brand-700 hover:underline">All examinations</Link></CardHeader>
        <CardContent>
          {progress.length === 0 ? <p className="text-sm text-slate-500">No examination this term yet. <Link className="text-brand-700 underline" href="/exams">Create one</Link>.</p> : (
            <Table>
              <THead><tr><TH>Examination</TH><TH>Exam marks</TH><TH>Activity scores (S1–S4)</TH><TH>Class-teacher comments</TH><TH>Head-teacher comments</TH><TH /></tr></THead>
              <tbody>{progress.map(({ e, t }) => (
                <TR key={e.id}>
                  <TD className="font-medium"><Link className="text-brand-800 hover:underline" href={`/exams/${e.id}`}>{e.name}</Link></TD>
                  <TD>{meter(t.marks)}</TD><TD>{meter(t.activities)}</TD><TD>{meter(t.classTeacher)}</TD><TD>{meter(t.headteacher)}</TD>
                  <TD className="text-sm">
                    <Link className="block whitespace-nowrap text-brand-700 hover:underline" href={`/exams/${e.id}/readiness`}>Readiness</Link>
                    <Link className="block whitespace-nowrap text-brand-700 hover:underline" href={`/exams/${e.id}/missing`}>Who is missing?</Link>
                  </TD>
                </TR>
              ))}</tbody>
            </Table>
          )}
        </CardContent>
      </Card>
      {latest && classAvg.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardContent><SimpleBarChart title={`Class average — ${latest.name} (%)`} data={classAvg.map((r) => ({ cls: r.code, avg: Math.round(r.avg * 10) / 10 }))} x="cls" y="avg" unit="%" domainMax={100} bands={{}} /></CardContent></Card>
          <Card><CardContent><SimpleBarChart title={`Subject average — ${latest.name} (%)`} data={subjAvg.map((r) => ({ s: r.name, avg: Math.round(r.avg * 10) / 10 }))} x="s" y="avg" unit="%" domainMax={100} bands={{}} /></CardContent></Card>
        </div>
      )}
    </>
  );
}

/** Teacher: their mark sheets this term with progress, class-teacher duties, and today's timetable. */
async function TeacherSection({ staffId, termId }: { staffId: string; termId?: string }) {
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  const [{ rows, termName }, classTeacher, slots] = await Promise.all([
    loadTeacherSheets(staffId),
    loadClassTeacher(staffId),
    termId ? prisma.timetableSlot.findMany({ where: { termId, staffId }, include: { subject: true, stream: { include: { schoolClass: true } } } }) : Promise.resolve([]),
  ]);
  const exams = [...new Map(rows.flatMap((r) => r.exams.map((e) => [e.examId, e.name] as const))).entries()];
  const anyOLevel = rows.some((r) => r.oLevel);
  const marksOwed = rows.reduce((a, r) => a + r.exams.filter((e) => e.state === "none" || e.state === "partial").length, 0);
  const actsOwed = rows.filter((r) => r.activities && (r.activities.state === "none" || r.activities.state === "partial")).length;
  const todo = [marksOwed && `${marksOwed} exam mark sheet${marksOwed === 1 ? "" : "s"}`, actsOwed && `activity scores on ${actsOwed} sheet${actsOwed === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>My mark sheets{termName ? <span className="block text-xs font-normal text-slate-500">{termName}</span> : null}</CardTitle>
          <Link href="/scores" className="text-sm text-brand-700 hover:underline">Enter scores</Link>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <p className="text-sm text-slate-500">You have no subjects allocated this year. Ask the Director of Studies to allocate your subjects and streams.</p> : (
            <>
              {todo ? <Alert tone="warn" className="mb-3">Still to finish: {todo}. Click a bar to open the sheet.</Alert> : exams.length > 0 && <Alert tone="success" className="mb-3">All your marks{anyOLevel ? " and activity scores" : ""} are in for this term.</Alert>}
              <div className="overflow-x-auto">
                <Table>
                  <THead><tr><TH>Subject</TH><TH>Stream</TH><TH className="text-right">Learners</TH>{exams.map(([id, name]) => <TH key={id}>{name}</TH>)}{anyOLevel && <TH>Activity scores</TH>}</tr></THead>
                  <tbody>{rows.map((r) => (
                    <TR key={`${r.subjectId}:${r.streamId}`}>
                      <TD className="font-medium">{r.subject}</TD><TD className="whitespace-nowrap">{r.stream}</TD><TD className="text-right">{r.learners}</TD>
                      {exams.map(([id]) => {
                        const e = r.exams.find((x) => x.examId === id);
                        return <TD key={id}>{e ? <Link href={`/exams/${id}/marks?streamId=${r.streamId}&subjectId=${r.subjectId}`} className="block hover:opacity-80"><ProgressMeter done={e.done} expected={e.expected} state={e.state} /></Link> : <span className="text-xs text-slate-400">—</span>}</TD>;
                      })}
                      {anyOLevel && <TD>{r.activities ? (r.activities.chapters === 0
                        ? <Link href="/scores?type=activity" className="text-xs font-medium text-red-700 hover:underline">add chapters</Link>
                        : <Link href="/scores?type=activity" className="block hover:opacity-80"><ProgressMeter done={r.activities.done} expected={r.activities.expected} state={r.activities.state} label={`${r.activities.done} / ${r.activities.expected} (${r.activities.chapters} ch.)`} /></Link>) : <span className="text-xs text-slate-400">—</span>}</TD>}
                    </TR>
                  ))}</tbody>
                </Table>
              </div>
              {exams.length === 0 && <p className="mt-2 text-sm text-slate-500">No examination has been created for this term yet.</p>}
            </>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        {classTeacher.length > 0 && (
          <Card>
            <CardHeader><CardTitle>My class{classTeacher.length > 1 ? "es" : ""}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {classTeacher.map((c) => (
                <div key={c.streamId} className="rounded-md border border-slate-200 p-3">
                  <p className="font-semibold">{c.name} <span className="text-sm font-normal text-slate-500">· {c.learners} learners</span></p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Link href={`/students/confirm?classId=${c.classId}&streamId=${c.streamId}`} className="block hover:opacity-80"><p className="text-xs text-slate-500">Reported this term</p><ProgressMeter done={c.reported} expected={c.learners} state={progressOf(c.reported, c.learners)} /></Link>
                    {c.exam && <Link href={`/exams/${c.exam.id}/comments?streamId=${c.streamId}`} className="block hover:opacity-80"><p className="text-xs text-slate-500">My comments — {c.exam.name}</p><ProgressMeter done={c.comments} expected={c.learners} state={progressOf(c.comments, c.learners)} /></Link>}
                  </div>
                  <div className="mt-2 flex gap-3 text-sm"><Link href="/attendance" className="text-brand-700 underline">Take attendance</Link><Link href={`/students?streamId=${c.streamId}`} className="text-brand-700 underline">Class list</Link></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>My timetable</CardTitle></CardHeader>
          <CardContent>
            {slots.length ? <TimetableGrid title="you" slots={slots.map((s) => ({ id: s.id, day: s.dayOfWeek, start: s.startTime, end: s.endTime, title: s.subject?.name ?? s.label ?? "", sub: `${s.stream.schoolClass.code} ${s.stream.name}${s.dayOfWeek === dow ? " · today" : ""}` }))} /> : <p className="text-sm text-slate-500">No timetable periods yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
