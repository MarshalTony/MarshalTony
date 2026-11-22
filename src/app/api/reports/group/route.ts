import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { studentName } from "@/lib/utils";

/** Member list of a house or club: ?kind=house|club&id=…&format=xlsx|pdf|csv */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"), id = url.searchParams.get("id") ?? "";
  const pick = { admissionNo: true, firstName: true, lastName: true, otherNames: true, gender: true, residence: true, schoolClass: { select: { code: true, order: true } }, stream: { select: { name: true } } } as const;
  let title: string, patron: string, rows: { s: { admissionNo: string; firstName: string; lastName: string; otherNames: string | null; gender: string; residence: string; schoolClass: { code: string; order: number }; stream: { name: string } }; role: string | null }[];
  if (kind === "house") {
    const h = await prisma.house.findUnique({ where: { id }, include: { patron: true } });
    if (!h) return new Response("Not found", { status: 404 });
    title = `${h.name} House`; patron = h.patron ? `${h.patron.lastName} ${h.patron.firstName}` : "";
    rows = (await prisma.student.findMany({ where: { houseId: id, status: "ACTIVE" }, select: pick })).map((s) => ({ s, role: null }));
  } else if (kind === "club") {
    const c = await prisma.club.findUnique({ where: { id }, include: { patron: true } });
    if (!c) return new Response("Not found", { status: 404 });
    title = c.name; patron = c.patron ? `${c.patron.lastName} ${c.patron.firstName}` : "";
    rows = (await prisma.clubMember.findMany({ where: { clubId: id, student: { status: "ACTIVE" } }, select: { role: true, student: { select: pick } } })).map((m) => ({ s: m.student, role: m.role }));
  } else return new Response("Not found", { status: 404 });
  rows.sort((a, b) => a.s.schoolClass.order - b.s.schoolClass.order || a.s.stream.name.localeCompare(b.s.stream.name) || a.s.lastName.localeCompare(b.s.lastName));
  const boys = rows.filter((r) => r.s.gender === "MALE").length;
  return tableReport({
    title: `${title} — members`,
    subtitle: `${patron ? `Patron: ${patron} · ` : ""}${rows.length} members (${boys} boys, ${rows.length - boys} girls)`,
    filename: `${kind}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    columns: [
      { key: "no", header: "#", width: 5, align: "right" }, { key: "adm", header: "Adm. No.", width: 16 }, { key: "name", header: "Name", width: 32 },
      { key: "sex", header: "Sex", width: 6, align: "center" }, { key: "cls", header: "Class", width: 10 }, { key: "res", header: "Day/Boarding", width: 12 },
      ...(kind === "club" ? [{ key: "role", header: "Role", width: 18 }] : []),
    ],
    rows: rows.map((r, i) => ({ no: i + 1, adm: r.s.admissionNo, name: studentName(r.s), sex: r.s.gender === "MALE" ? "M" : "F", cls: `${r.s.schoolClass.code} ${r.s.stream.name}`, res: r.s.residence === "DAY" ? "Day" : "Boarding", role: r.role ?? "" })),
  }, url.searchParams.get("format"), user);
}
