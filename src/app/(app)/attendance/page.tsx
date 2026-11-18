import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveStaffAttendance, saveStudentAttendance } from "@/server/actions/attendance";
import { AttendanceGrid } from "@/components/attendance-grid";
import { FilterBar } from "@/components/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, hrefWith, sp, type SP } from "@/components/data-table";
import { classTree, streamOptions } from "@/server/queries/lookups";
import { isoDate, studentName } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("attendance.take", "attendance.view", "attendance.staff");
  const params = await searchParams;
  const tabs = [
    can(user, "attendance.take") && ["take", "Take attendance"],
    can(user, "attendance.view") && ["report", "Student reports"],
    can(user, "attendance.staff") && ["staff", "Staff attendance"],
  ].filter(Boolean) as [string, string][];
  const tab = sp(params, "tab") ?? tabs[0][0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
  const tree = await classTree();
  // Streams a plain teacher may register: class-teacher or allocated streams.
  let streams = streamOptions(tree);
  if (!can(user, "attendance.view", "students.manage") && user.staffId) {
    const [ct, al] = await Promise.all([
      prisma.stream.findMany({ where: { classTeacherId: user.staffId }, select: { id: true } }),
      prisma.teacherAllocation.findMany({ where: { staffId: user.staffId, academicYear: { isCurrent: true } }, select: { streamId: true } }),
    ]);
    const mine = new Set([...ct.map((s) => s.id), ...al.map((a) => a.streamId)]);
    streams = streams.filter((s) => mine.has(s.value));
  }
  const nav = (
    <div className="no-print mb-5 flex gap-1 border-b border-slate-200">
      {tabs.map(([k, l]) => <Link key={k} href={`/attendance?tab=${k}`} className={`border-b-2 px-3 py-2 text-sm ${tab === k ? "border-brand-700 font-medium text-brand-800" : "border-transparent text-slate-600"}`}>{l}</Link>)}
    </div>
  );

  if (tab === "take") {
    const streamId = sp(params, "streamId") ?? streams[0]?.value;
    const date = sp(params, "date") ?? today;
    const students = streamId ? await prisma.student.findMany({ where: { streamId, status: "ACTIVE" }, include: { attendance: { where: { date: new Date(`${date}T00:00:00Z`) } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }) : [];
    return (
      <>
        <PageHeader title="Attendance" />{nav}
        <FilterBar filters={[{ name: "streamId", label: "Stream", allowAll: false, value: streamId, options: streams }]}>
          <input type="hidden" name="tab" value="take" />
          <Input type="date" name="date" defaultValue={date} max={today} className="w-auto" aria-label="Date" />
        </FilterBar>
        {!streamId ? <Alert>You are not allocated to any stream.</Alert> : students.length === 0 ? <Alert>No active students in this stream.</Alert> : (
          <AttendanceGrid action={saveStudentAttendance} hidden={{ streamId, date }}
            rows={students.map((s) => ({ id: s.id, label: studentName(s), sub: s.admissionNo, status: s.attendance[0]?.status ?? null, remark: s.attendance[0]?.remark ?? null }))} />
        )}
      </>
    );
  }

  if (tab === "report") {
    const streamId = sp(params, "streamId") ?? streams[0]?.value;
    const from = sp(params, "from") ?? isoDate(new Date(Date.now() - 30 * 86400_000));
    const to = sp(params, "to") ?? today;
    const rows = streamId ? await prisma.studentAttendance.groupBy({ by: ["studentId", "status"], where: { streamId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, _count: true }) : [];
    const students = streamId ? await prisma.student.findMany({ where: { streamId, status: "ACTIVE" }, orderBy: { lastName: "asc" } }) : [];
    const c = (id: string, st: string) => rows.find((r) => r.studentId === id && r.status === st)?._count ?? 0;
    return (
      <>
        <PageHeader title="Attendance" />{nav}
        <FilterBar filters={[{ name: "streamId", label: "Stream", allowAll: false, value: streamId, options: streams }]}>
          <input type="hidden" name="tab" value="report" />
          <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From" />
          <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To" />
        </FilterBar>
        <div className="mb-3 flex justify-end gap-2">
          {["pdf", "xlsx"].map((f) => <Button key={f} asChild size="sm" variant="outline"><a href={hrefWith("/api/reports/attendance", params, { streamId, from, to, format: f })} target="_blank"><Download />{f.toUpperCase()}</a></Button>)}
        </div>
        <Table>
          <THead><tr><TH>Student</TH><TH>Present</TH><TH>Late</TH><TH>Absent</TH><TH>Excused</TH><TH>Attendance %</TH></tr></THead>
          <tbody>
            {students.map((s) => {
              const p = c(s.id, "PRESENT"), l = c(s.id, "LATE"), a = c(s.id, "ABSENT"), e = c(s.id, "EXCUSED");
              const tot = p + l + a + e;
              const pct = tot ? ((p + l) / tot) * 100 : null;
              return <TR key={s.id}><TD>{studentName(s)}</TD><TD>{p}</TD><TD>{l}</TD><TD className={a ? "font-semibold text-red-700" : ""}>{a}</TD><TD>{e}</TD><TD>{pct === null ? "—" : `${pct.toFixed(0)}%`}</TD></TR>;
            })}
          </tbody>
        </Table>
      </>
    );
  }

  // staff
  const date = sp(params, "date") ?? today;
  const month = date.slice(0, 7);
  const [staff, monthly] = await Promise.all([
    prisma.staff.findMany({ where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, include: { attendance: { where: { date: new Date(`${date}T00:00:00Z`) } } }, orderBy: { lastName: "asc" } }),
    prisma.staffAttendance.groupBy({ by: ["staffId", "status"], where: { date: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(new Date(`${month}-01T00:00:00Z`).setUTCMonth(new Date(`${month}-01T00:00:00Z`).getUTCMonth() + 1)) } }, _count: true }),
  ]);
  const mc = (id: string, st: string) => monthly.find((r) => r.staffId === id && r.status === st)?._count ?? 0;
  return (
    <>
      <PageHeader title="Attendance" />{nav}
      <FilterBar><input type="hidden" name="tab" value="staff" /><Input type="date" name="date" defaultValue={date} max={today} className="w-auto" aria-label="Date" /></FilterBar>
      <div className="grid gap-5 xl:grid-cols-2">
        <AttendanceGrid action={saveStaffAttendance} hidden={{ date }} withTime
          rows={staff.map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName}`, sub: s.designation, status: s.attendance[0]?.status ?? null, remark: s.attendance[0]?.remark ?? null, timeIn: s.attendance[0]?.timeIn }))} />
        <Card>
          <CardHeader><CardTitle>Monthly summary — {month}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Staff</TH><TH>Present</TH><TH>Late</TH><TH>Absent</TH><TH>Excused</TH></tr></THead>
              <tbody>{staff.map((s) => <TR key={s.id}><TD>{s.lastName} {s.firstName}</TD><TD>{mc(s.id, "PRESENT")}</TD><TD>{mc(s.id, "LATE")}</TD><TD>{mc(s.id, "ABSENT")}</TD><TD>{mc(s.id, "EXCUSED")}</TD></TR>)}</tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
