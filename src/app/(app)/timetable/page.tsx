import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { deleteTimetableSlot, saveTimetableSlot } from "@/server/actions/academics";
import { ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Alert, EmptyState, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { classTree, streamOptions } from "@/server/queries/lookups";
import { TimetableGrid } from "@/components/timetable-grid";

export const metadata = { title: "Timetables" };
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function TimetablePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("academics.view");
  const params = await searchParams;
  const manage = can(user, "academics.manage");
  const term = await prisma.term.findFirst({ where: { isCurrent: true } });
  if (!term) return <Alert tone="warn">Set a current term first.</Alert>;
  const tree = await classTree();
  const streamId = sp(params, "streamId") ?? tree[0]?.streams[0]?.id;
  const stream = tree.flatMap((c) => c.streams.map((s) => ({ ...s, cls: c }))).find((s) => s.id === streamId);
  const [slots, subjects, staff] = await Promise.all([
    streamId ? prisma.timetableSlot.findMany({ where: { termId: term.id, streamId }, include: { subject: true, staff: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }) : [],
    stream ? prisma.subject.findMany({ where: { level: stream.cls.level as any, isActive: true }, orderBy: { name: "asc" } }) : [],
    prisma.staff.findMany({ where: { status: "ACTIVE", isTeaching: true }, orderBy: { lastName: "asc" } }),
  ]);
  const fields = (s?: (typeof slots)[number]) => (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="termId" value={term.id} />
      <input type="hidden" name="streamId" value={streamId} />
      <Grid cols={3}>
        <SelectField label="Day" name="dayOfWeek" defaultValue={String(s?.dayOfWeek ?? 1)} options={DAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />
        <TextField label="Start" name="startTime" type="time" defaultValue={s?.startTime ?? "08:00"} required />
        <TextField label="End" name="endTime" type="time" defaultValue={s?.endTime ?? "08:40"} required />
      </Grid>
      <Grid>
        <SelectField label="Subject" name="subjectId" defaultValue={s?.subjectId ?? ""} placeholder="— none (break/assembly) —" options={subjects.map((x) => ({ value: x.id, label: x.name }))} />
        <SelectField label="Teacher" name="staffId" defaultValue={s?.staffId ?? ""} placeholder="—" options={staff.map((x) => ({ value: x.id, label: `${x.lastName} ${x.firstName}` }))} />
        <TextField label="Label (if no subject)" name="label" defaultValue={s?.label ?? ""} placeholder="Break, Lunch, Games…" />
        <TextField label="Room" name="room" defaultValue={s?.room ?? ""} />
      </Grid>
    </>
  );
  return (
    <>
      <PageHeader title="Timetables" description={`Class timetable for the current term. Teacher double-booking is prevented.`} actions={
        manage && streamId ? <FormDialog trigger="Add period" title="Add a period" action={saveTimetableSlot} wide>{fields()}</FormDialog> : null
      } />
      <FilterBar filters={[{ name: "streamId", label: "Stream", allowAll: false, value: streamId, options: streamOptions(tree) }]} />
      {!stream ? <EmptyState title="No streams set up yet" /> : (
        <TimetableGrid
          title={`${stream.cls.name} ${stream.name}`}
          slots={slots.map((s) => ({
            id: s.id, day: s.dayOfWeek, start: s.startTime, end: s.endTime, title: s.subject?.name ?? s.label ?? "",
            sub: [s.staff ? `${s.staff.lastName} ${s.staff.firstName[0]}.` : null, s.room].filter(Boolean).join(" · "),
            actions: manage ? (
              <span className="flex gap-1">
                <FormDialog trigger="Edit" title="Edit period" action={saveTimetableSlot} triggerVariant="ghost" triggerSize="sm" wide>{fields(s)}</FormDialog>
                <ConfirmAction action={deleteTimetableSlot} fields={{ id: s.id }} label="×" variant="ghost" confirm="Remove this period?" />
              </span>
            ) : null,
          }))}
        />
      )}
    </>
  );
}
