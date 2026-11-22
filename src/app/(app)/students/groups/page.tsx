import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { allocateStudentsToHouses, deleteClub, deleteHouse, saveClub, saveHouse } from "@/server/actions/groups";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";

export const metadata = { title: "Clubs & Houses" };

/** Houses (one per student, shared out fairly) and clubs (several per student), with members per class and sex. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("students.view");
  const manage = can(user, "students.manage");
  const tab = sp(await searchParams, "tab") === "clubs" ? "clubs" : "houses";
  const [houses, clubs, staff, classes, activeTotal, noHouse] = await Promise.all([
    prisma.house.findMany({ orderBy: { name: "asc" }, include: { patron: true } }),
    prisma.club.findMany({ orderBy: { name: "asc" }, include: { patron: true } }),
    prisma.staff.findMany({ where: { status: { not: "EXITED" } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.student.count({ where: { status: "ACTIVE", houseId: null } }),
  ]);
  const [houseCounts, clubCounts] = await Promise.all([
    prisma.student.groupBy({ by: ["houseId", "classId", "gender"], where: { status: "ACTIVE", houseId: { not: null } }, _count: true }),
    prisma.clubMember.findMany({ where: { student: { status: "ACTIVE" } }, select: { clubId: true, studentId: true, student: { select: { gender: true } } } }),
  ]);
  const staffOpts = staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName}` }));
  const hc = (houseId: string, f: (r: (typeof houseCounts)[number]) => boolean = () => true) => houseCounts.filter((r) => r.houseId === houseId && f(r)).reduce((a, r) => a + r._count, 0);
  const inClubs = new Set(clubCounts.map((c) => c.studentId)).size;
  const tabLink = (t: string, label: string) => (
    <Link href={`/students/groups${t === "clubs" ? "?tab=clubs" : ""}`} className={`rounded-full border px-3 py-1 text-sm ${tab === t ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white hover:border-brand-400"}`}>{label}</Link>
  );

  const houseFields = (h?: (typeof houses)[number]) => (
    <>
      {h && <input type="hidden" name="id" value={h.id} />}
      <Grid>
        <TextField label="House name" name="name" required defaultValue={h?.name} placeholder="e.g. Mukasa" />
        <TextField label="Colour" name="colour" defaultValue={h?.colour ?? ""} placeholder="e.g. Red" />
      </Grid>
      <SelectField label="House patron / master" name="patronId" defaultValue={h?.patronId ?? ""} placeholder="—" options={staffOpts} />
      {h ? <CheckboxField name="isActive" label="Active (inactive houses get no new students)" defaultChecked={h.isActive} /> : <input type="hidden" name="isActive" value="true" />}
    </>
  );
  const clubFields = (c?: (typeof clubs)[number]) => (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <TextField label="Club name" name="name" required defaultValue={c?.name} placeholder="e.g. Debate Club, Scripture Union, Wildlife Club" />
      <TextAreaField label="Description" name="description" defaultValue={c?.description ?? ""} rows={2} />
      <SelectField label="Patron (teacher in charge)" name="patronId" defaultValue={c?.patronId ?? ""} placeholder="—" options={staffOpts} />
      {c ? <CheckboxField name="isActive" label="Active" defaultChecked={c.isActive} /> : <input type="hidden" name="isActive" value="true" />}
    </>
  );

  return (
    <>
      <PageHeader
        title="Clubs & Houses"
        description="School houses (each student in one house) and clubs and societies (a student can join several). Open a house or club to add or remove members and print its list."
        actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
      />
      <nav className="mb-4 flex gap-1" aria-label="Clubs and houses">{tabLink("houses", `Houses (${houses.length})`)}{tabLink("clubs", `Clubs (${clubs.length})`)}</nav>

      {tab === "houses" ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Houses" value={houses.filter((h) => h.isActive).length} />
            <StatCard label="Students in a house" value={activeTotal - noHouse} />
            <StatCard label="Without a house" value={noHouse} hint={noHouse ? <Link className="underline" href="/students?house=none">show</Link> : "all placed"} />
            <StatCard label="Active students" value={activeTotal} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Houses</CardTitle>
              {manage && (
                <span className="flex flex-wrap gap-2">
                  {noHouse > 0 && houses.filter((h) => h.isActive).length >= 2 && (
                    <FormDialog trigger={`Share out students without a house (${noHouse})`} title="Share students among the houses" action={allocateStudentsToHouses} triggerVariant="outline" triggerSize="sm" submitLabel="Share out">
                      <Alert>Each student without a house goes to the house with the fewest students of the same class and sex, so every house gets a fair mix. Students already in a house are not moved.</Alert>
                      <SelectField label="Which students" name="classId" placeholder={`All classes (${noHouse})`} options={classes.map((c) => ({ value: c.id, label: `${c.name} only` }))} />
                    </FormDialog>
                  )}
                  <FormDialog trigger="New house" title="New house" action={saveHouse} triggerSize="sm">{houseFields()}</FormDialog>
                </span>
              )}
            </CardHeader>
            <CardContent>
              {houses.length === 0 ? <p className="text-sm text-slate-500">No houses yet.{manage ? " Create them with New house, then use Share out to place students." : ""}</p> : (
                <Table>
                  <THead><tr><TH>House</TH><TH>Patron</TH><TH className="text-right">Boys</TH><TH className="text-right">Girls</TH><TH className="text-right">Total</TH>{classes.map((c) => <TH key={c.id} className="text-right">{c.code}</TH>)}<TH /></tr></THead>
                  <tbody>
                    {houses.map((h) => (
                      <TR key={h.id} className={h.isActive ? "" : "opacity-50"}>
                        <TD><Link className="font-medium text-brand-800 hover:underline" href={`/students/groups/house/${h.id}`}>{h.name}</Link>{h.colour && <span className="ml-2 text-xs text-slate-500">{h.colour}</span>}{!h.isActive && <Badge className="ml-2">inactive</Badge>}</TD>
                        <TD className="text-xs">{h.patron ? `${h.patron.lastName} ${h.patron.firstName}` : "—"}</TD>
                        <TD className="text-right">{hc(h.id, (r) => r.gender === "MALE")}</TD>
                        <TD className="text-right">{hc(h.id, (r) => r.gender === "FEMALE")}</TD>
                        <TD className="text-right font-semibold">{hc(h.id)}</TD>
                        {classes.map((c) => <TD key={c.id} className="text-right text-xs">{hc(h.id, (r) => r.classId === c.id) || ""}</TD>)}
                        <TD className="whitespace-nowrap text-right">
                          {manage && <FormDialog trigger="Edit" title={`Edit ${h.name}`} action={saveHouse} triggerVariant="outline" triggerSize="sm">{houseFields(h)}</FormDialog>}{" "}
                          {manage && <ConfirmAction action={deleteHouse} fields={{ id: h.id }} label="Delete" variant="ghost" confirm={`Delete ${h.name}? Its ${hc(h.id)} student(s) will have no house.`} />}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Clubs" value={clubs.filter((c) => c.isActive).length} />
            <StatCard label="Students in a club" value={inClubs} />
            <StatCard label="In no club" value={activeTotal - inClubs} hint={<Link className="underline" href="/students?club=none">show</Link>} />
            <StatCard label="Memberships" value={clubCounts.length} hint="a student can be in several clubs" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Clubs and societies</CardTitle>
              {manage && <FormDialog trigger="New club" title="New club" action={saveClub} triggerSize="sm">{clubFields()}</FormDialog>}
            </CardHeader>
            <CardContent>
              {clubs.length === 0 ? <p className="text-sm text-slate-500">No clubs yet.</p> : (
                <Table>
                  <THead><tr><TH>Club</TH><TH>Patron</TH><TH className="text-right">Boys</TH><TH className="text-right">Girls</TH><TH className="text-right">Members</TH><TH /></tr></THead>
                  <tbody>
                    {clubs.map((c) => {
                      const m = clubCounts.filter((x) => x.clubId === c.id);
                      return (
                        <TR key={c.id} className={c.isActive ? "" : "opacity-50"}>
                          <TD><Link className="font-medium text-brand-800 hover:underline" href={`/students/groups/club/${c.id}`}>{c.name}</Link>{c.description && <p className="text-xs text-slate-500">{c.description}</p>}</TD>
                          <TD className="text-xs">{c.patron ? `${c.patron.lastName} ${c.patron.firstName}` : "—"}</TD>
                          <TD className="text-right">{m.filter((x) => x.student.gender === "MALE").length}</TD>
                          <TD className="text-right">{m.filter((x) => x.student.gender === "FEMALE").length}</TD>
                          <TD className="text-right font-semibold">{m.length}</TD>
                          <TD className="whitespace-nowrap text-right">
                            {manage && <FormDialog trigger="Edit" title={`Edit ${c.name}`} action={saveClub} triggerVariant="outline" triggerSize="sm">{clubFields(c)}</FormDialog>}{" "}
                            {manage && <ConfirmAction action={deleteClub} fields={{ id: c.id }} label="Delete" variant="ghost" confirm={`Delete ${c.name} and its ${m.length} membership(s)?`} />}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Download className="h-3 w-3" />Each house or club page has Excel and PDF member lists.</p>
    </>
  );
}
