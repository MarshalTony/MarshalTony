import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { studentWhere } from "@/server/queries/students";
import { tableReport } from "@/server/reports/table";
import { fmtDate, studentName } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);
  const students = await prisma.student.findMany({
    where: studentWhere(params), include: { schoolClass: true, stream: true, house: true, guardians: { where: { isPrimary: true }, include: { guardian: true } } },
    orderBy: [{ schoolClass: { order: "asc" } }, { stream: { name: "asc" } }, { lastName: "asc" }],
  });
  return tableReport({
    title: "Student Register", subtitle: `${students.length} students`, filename: "students", landscape: true,
    columns: [
      { key: "adm", header: "Adm. No", width: 12 }, { key: "name", header: "Name", width: 22 }, { key: "g", header: "Sex", width: 4 },
      { key: "dob", header: "Date of birth", width: 10 }, { key: "cls", header: "Class", width: 7 }, { key: "res", header: "Day/Board", width: 8 }, { key: "house", header: "House", width: 10 },
      { key: "status", header: "Status", width: 9 }, { key: "guardian", header: "Primary guardian", width: 18 }, { key: "phone", header: "Phone", width: 12 },
    ],
    rows: students.map((s) => ({
      adm: s.admissionNo, name: studentName(s), g: s.gender === "MALE" ? "M" : "F", dob: fmtDate(s.dateOfBirth), cls: `${s.schoolClass.code} ${s.stream.name}`,
      res: s.residence, house: s.house?.name ?? "", status: s.status, guardian: s.guardians[0]?.guardian.fullName, phone: s.guardians[0]?.guardian.phone,
    })),
  }, url.searchParams.get("format") ?? "xlsx", user);
}
