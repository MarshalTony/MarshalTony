import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { tableReport } from "@/server/reports/table";
import { fmtDate, studentName, todayDate } from "@/lib/utils";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const u = new URL(req.url);
  const type = u.searchParams.get("type");
  const format = u.searchParams.get("format");
  if (type === "inventory" && can(user, "inventory.manage")) {
    const items = await prisma.inventoryItem.findMany({ include: { category: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] });
    const value = items.reduce((a, i) => a + Number(i.unitCost ?? 0) * Number(i.quantityOnHand), 0);
    return tableReport({ title: "Inventory & Asset Register", filename: "inventory", landscape: true,
      columns: [{ key: "code", header: "Code", width: 9 }, { key: "name", header: "Item", width: 22 }, { key: "cat", header: "Category", width: 14 }, { key: "kind", header: "Type", width: 7 }, { key: "qty", header: "On hand", width: 8 }, { key: "reorder", header: "Reorder at", width: 8 }, { key: "loc", header: "Location", width: 12 }, { key: "value", header: "Value (UGX)", width: 11, money: true }, { key: "flag", header: "Alert", width: 7 }],
      rows: items.map((i) => ({ code: i.code, name: i.name, cat: i.category.name, kind: i.isAsset ? "Asset" : "Stock", qty: `${Number(i.quantityOnHand)} ${i.unit}`, reorder: Number(i.reorderLevel), loc: i.location, value: Number(i.unitCost ?? 0) * Number(i.quantityOnHand), flag: !i.isAsset && Number(i.reorderLevel) > 0 && Number(i.quantityOnHand) <= Number(i.reorderLevel) ? "REORDER" : "" })),
      totals: { name: "Total value", value } }, format, user);
  }
  if (type === "library" && can(user, "library.manage")) {
    const loans = await prisma.libraryLoan.findMany({ where: { returnedAt: null }, include: { book: true, student: { include: { schoolClass: true } }, staff: true }, orderBy: { dueDate: "asc" } });
    const today = todayDate();
    return tableReport({ title: "Library — Books on Loan", subtitle: `${loans.filter((l) => l.dueDate < today).length} overdue`, filename: "library-loans",
      columns: [{ key: "book", header: "Book", width: 24 }, { key: "acc", header: "Acc. no", width: 9 }, { key: "who", header: "Borrower", width: 20 }, { key: "issued", header: "Issued", width: 9 }, { key: "due", header: "Due", width: 9 }, { key: "late", header: "Days late", width: 7 }],
      rows: loans.map((l) => ({ book: l.book.title, acc: l.book.accessionNo, who: l.student ? `${studentName(l.student)} (${l.student.schoolClass.code})` : `${l.staff?.lastName} ${l.staff?.firstName} (staff)`, issued: fmtDate(l.borrowedAt), due: fmtDate(l.dueDate), late: Math.max(0, Math.floor((+today - +l.dueDate) / 86400_000)) || "" })) }, format, user);
  }
  if (type === "transport" && can(user, "transport.manage")) {
    const rows = await prisma.studentTransport.findMany({ where: { term: { isCurrent: true } }, include: { student: { include: { schoolClass: true, guardians: { where: { isPrimary: true }, include: { guardian: true } } } }, route: { include: { vehicle: true } } }, orderBy: [{ route: { name: "asc" } }] });
    return tableReport({ title: "Transport Register (current term)", filename: "transport",
      columns: [{ key: "route", header: "Route", width: 14 }, { key: "veh", header: "Vehicle", width: 9 }, { key: "name", header: "Student", width: 20 }, { key: "cls", header: "Class", width: 6 }, { key: "pick", header: "Pick-up", width: 14 }, { key: "phone", header: "Guardian phone", width: 12 }],
      rows: rows.map((r) => ({ route: r.route.name, veh: r.route.vehicle?.regNo, name: studentName(r.student), cls: r.student.schoolClass.code, pick: r.pickupPoint, phone: r.student.guardians[0]?.guardian.phone })) }, format, user);
  }
  if (type === "discipline" && can(user, "discipline.manage")) {
    const rows = await prisma.disciplineIncident.findMany({ include: { student: { include: { schoolClass: true } } }, orderBy: { date: "desc" }, take: 1000 });
    return tableReport({ title: "Discipline Report", subtitle: "Confidential", filename: "discipline", landscape: true,
      columns: [{ key: "date", header: "Date", width: 9 }, { key: "name", header: "Student", width: 18 }, { key: "cls", header: "Class", width: 6 }, { key: "cat", header: "Category", width: 14 }, { key: "sev", header: "Severity", width: 8 }, { key: "desc", header: "Description", width: 30 }, { key: "act", header: "Action", width: 20 }, { key: "st", header: "Status", width: 8 }],
      rows: rows.map((r) => ({ date: fmtDate(r.date), name: studentName(r.student), cls: r.student.schoolClass.code, cat: r.category, sev: r.severity, desc: r.description, act: r.actionTaken, st: r.status })) }, format, user);
  }
  return new Response("Forbidden or unknown report", { status: 403 });
}
