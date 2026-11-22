import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { addClubMembers, addToHouse, removeClubMembers, removeFromHouse, setClubRole } from "@/server/actions/groups";
import { CLUB_ROLES } from "@/lib/houses";
import { MemberPicker } from "@/components/member-picker";
import { ScorePicker } from "@/components/score-picker";
import { FormDialog, SelectField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { studentName } from "@/lib/utils";

export const metadata = { title: "House / club members" };

const pick = { id: true, admissionNo: true, firstName: true, lastName: true, otherNames: true, gender: true, houseId: true, schoolClass: { select: { code: true, order: true } }, stream: { select: { name: true } } } as const;

/** One house or club: its members (remove, roles for clubs, Excel/PDF list) and adding students class by class. */
export default async function GroupPage({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const manage = can(user, "students.manage");
  const { kind, id } = await params;
  if (kind !== "house" && kind !== "club") notFound();
  const q = await searchParams;
  const classId = sp(q, "classId"), streamId = sp(q, "streamId");
  const isHouse = kind === "house";

  const group = isHouse
    ? await prisma.house.findUnique({ where: { id }, include: { patron: true } })
    : await prisma.club.findUnique({ where: { id }, include: { patron: true } });
  if (!group) notFound();
  const members = isHouse
    ? (await prisma.student.findMany({ where: { houseId: id, status: "ACTIVE" }, select: pick })).map((s) => ({ s, role: null as string | null }))
    : (await prisma.clubMember.findMany({ where: { clubId: id, student: { status: "ACTIVE" } }, select: { role: true, student: { select: pick } } })).map((m) => ({ s: m.student, role: m.role }));
  members.sort((a, b) => a.s.schoolClass.order - b.s.schoolClass.order || a.s.stream.name.localeCompare(b.s.stream.name) || a.s.lastName.localeCompare(b.s.lastName));
  const memberIds = new Set(members.map((m) => m.s.id));

  const classes = await prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } } });
  const cls = classes.find((c) => c.id === classId);
  const candidates = manage && cls
    ? (await prisma.student.findMany({ where: { status: "ACTIVE", classId: cls.id, ...(streamId ? { streamId } : {}) }, select: { ...pick, house: { select: { name: true } } }, orderBy: [{ stream: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }] }))
      .filter((s) => !memberIds.has(s.id))
    : [];
  const label = (s: (typeof members)[number]["s"]) => `${s.schoolClass.code} ${s.stream.name}`;
  const boys = members.filter((m) => m.s.gender === "MALE").length;
  const title = isHouse ? `${group.name} House` : group.name;
  const dl = (format: string) => `/api/reports/group?kind=${kind}&id=${id}&format=${format}`;

  return (
    <>
      <PageHeader
        title={title}
        description={`${isHouse ? "House" : "Club"} patron: ${group.patron ? `${group.patron.lastName} ${group.patron.firstName}` : "not set"}${"colour" in group && group.colour ? ` · colour ${group.colour}` : ""}${"description" in group && group.description ? ` · ${group.description}` : ""}`}
        actions={<>
          <Button asChild variant="outline"><a href={dl("xlsx")}><Download />Excel</a></Button>
          <Button asChild variant="outline"><a href={dl("pdf")} target="_blank"><FileText />PDF list</a></Button>
          <Button asChild variant="outline"><Link href={`/students/groups${isHouse ? "" : "?tab=clubs"}`}>All {isHouse ? "houses" : "clubs"}</Link></Button>
        </>}
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Members" value={members.length} />
        <StatCard label="Boys" value={boys} />
        <StatCard label="Girls" value={members.length - boys} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members ({members.length})</CardTitle>
            {manage && !isHouse && members.length > 0 && (
              <FormDialog trigger="Set a role" title={`Role in ${group.name}`} action={setClubRole} triggerVariant="outline" triggerSize="sm">
                <input type="hidden" name="clubId" value={id} />
                <SelectField label="Member" name="studentId" required placeholder="Choose" options={members.map((m) => ({ value: m.s.id, label: `${studentName(m.s)} (${label(m.s)})${m.role ? ` — ${m.role}` : ""}` }))} />
                <SelectField label="Role" name="role" placeholder="Ordinary member" options={CLUB_ROLES.map((r) => ({ value: r, label: r }))} />
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            {manage ? (
              <MemberPicker
                rows={members.map((m) => ({ id: m.s.id, admissionNo: m.s.admissionNo, name: studentName(m.s), detail: label(m.s), extra: m.role ?? "" }))}
                extraHeader={isHouse ? undefined : "Role"}
                action={isHouse ? removeFromHouse : removeClubMembers}
                hidden={isHouse ? { houseId: id } : { clubId: id }}
                submitLabel="Remove ticked" submitVariant="outline"
                confirm={`Remove the ticked students from ${title}?`}
                empty="No members yet. Add students on the right."
              />
            ) : (
              <ul className="space-y-1 text-sm">{members.map((m) => <li key={m.s.id}>{studentName(m.s)} <span className="text-xs text-slate-500">{m.s.admissionNo} · {label(m.s)}{m.role ? ` · ${m.role}` : ""}</span></li>)}</ul>
            )}
          </CardContent>
        </Card>
        {manage && (
          <Card>
            <CardHeader><CardTitle>Add students</CardTitle></CardHeader>
            <CardContent>
              <ScorePicker fields={[
                { name: "classId", label: "Class", placeholder: "Choose a class", value: classId, options: classes.map((c) => ({ value: c.id, label: c.name })), resets: ["streamId"] },
                { name: "streamId", label: "Stream", placeholder: "All streams", value: streamId, options: cls ? cls.streams.map((s) => ({ value: s.id, label: s.name })) : [] },
              ]} />
              {cls ? (
                <MemberPicker
                  rows={candidates.map((s) => ({ id: s.id, admissionNo: s.admissionNo, name: studentName(s), detail: label(s), extra: s.house?.name ?? "—" }))}
                  extraHeader={isHouse ? "Current house" : undefined}
                  action={isHouse ? addToHouse : addClubMembers}
                  hidden={isHouse ? { houseId: id } : { clubId: id }}
                  submitLabel={isHouse ? `Put ticked in ${group.name}` : `Add ticked to ${group.name}`}
                  empty={`Every active student in ${cls.name}${streamId ? " (this stream)" : ""} is already a member.`}
                />
              ) : <p className="text-sm text-slate-500">Choose a class to list its students.{isHouse ? " Students already in another house are moved to this one." : ""}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
