import { prisma } from "@/lib/db";
import { visibleAnnouncements } from "@/server/queries/announcements";
import type { CurrentUser } from "@/server/auth";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { fmtDate } from "@/lib/utils";

export async function PortalNotices({ user, classIds }: { user: CurrentUser; classIds: string[] }) {
  const audience = user.roles.includes("PARENT") ? "PARENTS" : "STUDENTS";
  const [notes, events] = await Promise.all([
    visibleAnnouncements(user, 10, classIds),
    prisma.calendarEvent.findMany({ where: { audience: { in: ["ALL", audience] }, endDate: { gte: new Date() } }, orderBy: { startDate: "asc" }, take: 8 }),
  ]);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Announcements</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {notes.map((n) => <div key={n.id} className="text-sm"><p className="font-medium">{n.isUrgent && <Badge color="red" className="mr-1">Urgent</Badge>}{n.title}</p><p className="whitespace-pre-wrap text-slate-600">{n.body}</p><p className="text-xs text-slate-400">{fmtDate(n.publishedAt)}</p></div>)}
          {notes.length === 0 && <p className="text-sm text-slate-500">No announcements.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Upcoming dates</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {events.map((e) => <p key={e.id}><b>{fmtDate(e.startDate)}</b> — {e.title} <Badge>{e.type}</Badge></p>)}
          {events.length === 0 && <p className="text-slate-500">Nothing scheduled.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
