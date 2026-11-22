import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { confirmStudents, unconfirmStudents } from "@/server/actions/confirmation";
import { MemberPicker } from "@/components/member-picker";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { fmtDate, studentName } from "@/lib/utils";

export const metadata = { title: "Confirm students" };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Confirm students: at the start of each term, tick the students who have reported. The board shows how many
 * have reported per class and stream; students not confirmed can be followed up (filter "Not reported" on Students).
 */
export default async function ConfirmStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const manage = can(user, "students.manage");
  const q = await searchParams;
  const terms = await prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" }, take: 9 });
  const term = terms.find((t) => t.id === sp(q, "termId")) ?? terms.find((t) => t.isCurrent) ?? terms[0];
  const header = (
    <PageHeader
      title="Confirm students"
      description="At the start of each term, tick the students who have reported back. Those not confirmed are listed so they can be followed up — and found on Students with the filter “Reported this term: No”."
      actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
    />
  );
  if (!term) return <>{header}<Alert tone="warn">Set up the academic year and terms first (Settings → Years & terms).</Alert></>;

  const classes = await prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } });
  const cls = classes.find((c) => c.id === sp(q, "classId"));
  const stream = cls?.streams.find((s) => s.id === sp(q, "streamId"));
  const [active, confirmed] = await Promise.all([
    prisma.student.groupBy({ by: ["streamId"], where: { status: "ACTIVE" }, _count: true }),
    prisma.student.groupBy({ by: ["streamId"], where: { status: "ACTIVE", confirmations: { some: { termId: term.id } } }, _count: true }),
  ]);
  const a = (id: string) => active.find((x) => x.streamId === id)?._count ?? 0;
  const c = (id: string) => confirmed.find((x) => x.streamId === id)?._count ?? 0;
  const totalActive = active.reduce((s, x) => s + x._count, 0), totalConfirmed = confirmed.reduce((s, x) => s + x._count, 0);

  const picker = (
    <ScorePicker fields={[
      { name: "termId", label: "Term", placeholder: "Term", value: term.id, options: terms.map((t) => ({ value: t.id, label: `${t.name} ${t.academicYear.name}${t.isCurrent ? " (current)" : ""}` })) },
      { name: "classId", label: "Class", placeholder: "All classes (summary)", value: cls?.id, resets: ["streamId"], options: classes.map((x) => ({ value: x.id, label: x.name })) },
      { name: "streamId", label: "Stream", placeholder: "All streams", value: stream?.id, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
    ]} />
  );

  let lists: React.ReactNode = null;
  if (cls) {
    const students = await prisma.student.findMany({
      where: { status: "ACTIVE", classId: cls.id, ...(stream ? { streamId: stream.id } : {}) },
      select: { id: true, admissionNo: true, firstName: true, lastName: true, otherNames: true, stream: { select: { name: true } }, confirmations: { where: { termId: term.id } } },
      orderBy: [{ stream: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
    });
    const byIds = [...new Set(students.flatMap((s) => s.confirmations.map((x) => x.confirmedById)).filter(Boolean) as string[])];
    const users = new Map((await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
    const notYet = students.filter((s) => !s.confirmations.length), done = students.filter((s) => s.confirmations.length);
    const row = (s: (typeof students)[number]) => ({ id: s.id, admissionNo: s.admissionNo, name: studentName(s), detail: `${cls.code} ${s.stream.name}` });
    lists = (
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className={notYet.length ? "text-amber-800" : ""}>Not yet confirmed ({notYet.length})</CardTitle></CardHeader>
          <CardContent>
            {manage ? (
              <MemberPicker rows={notYet.map(row)} action={confirmStudents} hidden={{ termId: term.id }} submitLabel="Confirm ticked as reported" empty="Everyone here is confirmed for this term." />
            ) : <ul className="space-y-1 text-sm">{notYet.map((s) => <li key={s.id}>{studentName(s)} <span className="text-xs text-slate-500">{s.admissionNo}</span></li>)}</ul>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Confirmed ({done.length})</CardTitle></CardHeader>
          <CardContent>
            {manage ? (
              <MemberPicker
                rows={done.map((s) => ({ ...row(s), extra: `${fmtDate(s.confirmations[0].confirmedAt)}${s.confirmations[0].confirmedById ? ` · ${users.get(s.confirmations[0].confirmedById) ?? ""}` : ""}` }))}
                extraHeader="Confirmed" action={unconfirmStudents} hidden={{ termId: term.id }} submitLabel="Undo for ticked" submitVariant="outline"
                confirm="Mark the ticked students as NOT reported for this term?" empty="Nobody confirmed yet."
              />
            ) : <ul className="space-y-1 text-sm">{done.map((s) => <li key={s.id}>{studentName(s)} <span className="text-xs text-slate-500">{s.admissionNo} · {fmtDate(s.confirmations[0].confirmedAt)}</span></li>)}</ul>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {header}
      {picker}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Reported — ${term.name} ${term.academicYear.name}`} value={`${totalConfirmed} / ${totalActive}`} hint={`${pct(totalConfirmed, totalActive)}%`} />
        <StatCard label="Not yet confirmed" value={totalActive - totalConfirmed} hint={<Link className="underline" href={`/students?reported=no`}>show list</Link>} />
      </div>
      {lists ?? (
        <Card>
          <CardHeader><CardTitle>Reporting by class and stream</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Class / stream</TH><TH className="text-right">Active</TH><TH className="text-right">Confirmed</TH><TH className="text-right">Not yet</TH><TH className="text-right">%</TH><TH /></tr></THead>
              <tbody>
                {classes.flatMap((k) => k.streams.map((st) => (
                  <TR key={st.id}>
                    <TD>{k.name} {st.name}</TD>
                    <TD className="text-right">{a(st.id)}</TD>
                    <TD className="text-right">{c(st.id)}</TD>
                    <TD className={`text-right ${a(st.id) - c(st.id) ? "font-medium text-amber-800" : ""}`}>{a(st.id) - c(st.id)}</TD>
                    <TD className="text-right">{a(st.id) ? `${pct(c(st.id), a(st.id))}%` : "—"}</TD>
                    <TD className="text-right"><Link className="text-sm text-brand-700 hover:underline" href={`/students/confirm?termId=${term.id}&classId=${k.id}&streamId=${st.id}`}>{manage ? "Confirm" : "View"}</Link></TD>
                  </TR>
                )))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
