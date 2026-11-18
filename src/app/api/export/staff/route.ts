import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { fmtDate } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "staff.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const rows = await prisma.staff.findMany({ where: { status: url.searchParams.get("status") ?? "ACTIVE" }, include: { department: true }, orderBy: { lastName: "asc" } });
  const sensitive = can(user, "hr.sensitive");
  return tableReport({
    title: "Staff List", filename: "staff", landscape: true,
    columns: [
      { key: "no", header: "Staff No", width: 10 }, { key: "name", header: "Name", width: 20 }, { key: "g", header: "Sex", width: 4 }, { key: "des", header: "Designation", width: 14 },
      { key: "dep", header: "Department", width: 14 }, { key: "phone", header: "Phone", width: 12 }, { key: "type", header: "Employment", width: 10 }, { key: "joined", header: "Joined", width: 10 },
      ...(sensitive ? [{ key: "salary", header: "Basic salary", width: 11, money: true }] : []),
    ],
    rows: rows.map((s) => ({
      no: s.staffNo, name: `${s.lastName} ${s.firstName}`, g: s.gender === "MALE" ? "M" : "F", des: s.designation, dep: s.department?.name, phone: s.phone,
      type: s.employmentType, joined: fmtDate(s.dateJoined), ...(sensitive ? { salary: s.basicSalary ? Number(s.basicSalary) : null } : {}),
    })),
  }, url.searchParams.get("format") ?? "xlsx", user);
}
