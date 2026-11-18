import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { deleteAnnouncement, saveAnnouncement } from "@/server/actions/communication";
import { deleteCalendarEvent, saveCalendarEvent } from "@/server/actions/academics";
import { visibleAnnouncements } from "@/server/queries/announcements";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Announcements & calendar" };
const AUD = [{ value: "ALL", label: "Everyone" }, { value: "STAFF", label: "Staff" }, { value: "PARENTS", label: "Parents" }, { value: "STUDENTS", label: "Students" }];

export default async function AnnouncementsPage() {
  const user = await requirePage();
  const manage = can(user, "announcements.manage");
  const [items, classes, events] = await Promise.all([
    manage ? prisma.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 50 }) : visibleAnnouncements(user, 50),
    prisma.schoolClass.findMany({ orderBy: { order: "asc" } }),
    prisma.calendarEvent.findMany({ where: { endDate: { gte: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { startDate: "asc" }, take: 60 }),
  ]);
  const terms = await prisma.term.findMany({ where: { endDate: { gte: new Date(Date.now() - 120 * 86400_000) } }, include: { academicYear: true }, orderBy: { startDate: "asc" } });
  const cls = new Map(classes.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeader title="Announcements & calendar" actions={manage && (
        <>
          <FormDialog trigger="Add calendar event" title="Calendar event" action={saveCalendarEvent} triggerVariant="outline">
            <TextField label="Title" name="title" required />
            <Grid>
              <SelectField label="Type" name="type" options={["EVENT", "EXAM", "HOLIDAY", "MEETING", "TERM"].map((t) => ({ value: t, label: t }))} />
              <SelectField label="Audience" name="audience" options={AUD} />
              <TextField label="Start" name="startDate" type="date" required />
              <TextField label="End" name="endDate" type="date" required />
            </Grid>
            <TextAreaField label="Details" name="description" rows={2} />
          </FormDialog>
          <FormDialog trigger="New announcement" title="New announcement" action={saveAnnouncement} wide>
            <TextField label="Title" name="title" required />
            <Grid>
              <SelectField label="Audience" name="audience" options={AUD} />
              <SelectField label="Class (optional)" name="classId" placeholder="All classes" options={classes.map((c) => ({ value: c.id, label: c.name }))} />
              <TextField label="Show until" name="expiresAt" type="date" />
            </Grid>
            <TextAreaField label="Message" name="body" rows={6} required />
            <CheckboxField name="isUrgent" label="Urgent / emergency" />
          </FormDialog>
        </>
      )} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.map((a) => (
            <Card key={a.id} className={a.isUrgent ? "border-red-300" : ""}>
              <CardHeader>
                <CardTitle>{a.isUrgent && <Badge color="red" className="mr-2">Urgent</Badge>}{a.title}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Badge>{a.audience}{a.classId ? ` · ${cls.get(a.classId)}` : ""}</Badge>{fmtDateTime(a.publishedAt)}
                  {manage && <ConfirmAction action={deleteAnnouncement} fields={{ id: a.id }} label="Remove" confirm="Remove this announcement?" />}
                </div>
              </CardHeader>
              <CardContent><p className="whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>{a.expiresAt && <p className="mt-2 text-xs text-slate-400">Until {fmtDate(a.expiresAt)}</p>}</CardContent>
            </Card>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-500">No announcements.</p>}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>School calendar</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {terms.map((t) => (
              <div key={t.id} className="rounded bg-brand-50 p-2"><p className="font-medium">{t.academicYear.name} {t.name}</p><p className="text-xs text-slate-600">Opens {fmtDate(t.startDate)} · closes {fmtDate(t.endDate)}</p></div>
            ))}
            {events.filter((e) => manage || e.audience === "ALL" || (e.audience === "STAFF" && user.staffId) || (e.audience === "PARENTS" && user.guardianId) || (e.audience === "STUDENTS" && user.studentId)).map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                <div><p className="font-medium">{e.title} <Badge>{e.type}</Badge></p><p className="text-xs text-slate-500">{fmtDate(e.startDate)}{+e.endDate !== +e.startDate ? ` – ${fmtDate(e.endDate)}` : ""}</p>{e.description && <p className="text-xs text-slate-600">{e.description}</p>}</div>
                {manage && <ConfirmAction action={deleteCalendarEvent} fields={{ id: e.id }} label="×" variant="ghost" confirm="Delete this event?" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
