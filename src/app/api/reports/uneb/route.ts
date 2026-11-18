import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { fmtDate, studentName } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "uneb.manage")) return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url);
  const level = u.searchParams.get("level") ?? "UCE";
  const year = Number(u.searchParams.get("year") ?? new Date().getFullYear());
  const rows = await prisma.unebCandidate.findMany({ where: { examLevel: level, year }, include: { student: true, subjects: { include: { subject: true } } }, orderBy: { student: { lastName: "asc" } } });
  return tableReport({
    title: `${level} ${year} Candidate List`, subtitle: `${rows.length} candidates · school record, not an official UNEB document`, filename: `${level}-${year}-candidates`, landscape: true,
    columns: [{ key: "no", header: "#", width: 3 }, { key: "idx", header: "Index no.", width: 11 }, { key: "name", header: "Name", width: 18 }, { key: "sex", header: "Sex", width: 3 }, { key: "dob", header: "DOB", width: 9 }, { key: "subj", header: "Subjects", width: 34 }, { key: "fees", header: "Fees", width: 5 }, { key: "status", header: "Status", width: 8 }],
    rows: rows.map((c, i) => ({ no: i + 1, idx: c.candidateNo ?? "", name: studentName(c.student), sex: c.student.gender === "MALE" ? "M" : "F", dob: fmtDate(c.student.dateOfBirth), subj: c.subjects.map((s) => s.subject.code).join(", "), fees: c.feesPaid ? "Paid" : "—", status: c.status })),
  }, u.searchParams.get("format"), user);
}
