"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { postInvoice } from "../fees/ledger";
import { todayDate } from "@/lib/utils";
import { nonZeroNumber } from "../schemas";

// ============================== LIBRARY ==============================
const FINE_PER_DAY = 500; // UGX per overdue day

export const saveBook = action(
  {
    permission: "library.manage", revalidate: "/library",
    schema: z.object({ id: zs.optId(), accessionNo: z.string().trim().toUpperCase().min(1).max(30), isbn: zs.optStr(20), title: zs.str(200), author: zs.optStr(150), publisher: zs.optStr(150), year: zs.optInt(), categoryId: zs.optId(), copies: z.coerce.number().int().min(1).max(1000), shelf: zs.optStr(30) }),
  },
  async ({ id, year, ...data }, user) => {
    if (data.isbn && !/^[\d-]{10,17}X?$/.test(data.isbn.replace(/\s/g, ""))) throw new UserError("ISBN should be 10 or 13 digits.");
    const b = id ? await prisma.book.update({ where: { id }, data: { ...data, year: year ?? null } }) : await prisma.book.create({ data: { ...data, year: year ?? null } });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Book", b.id, { title: data.title });
    return { ok: true, message: "Book saved." };
  },
);

export const issueBook = action(
  { permission: "library.manage", revalidate: "/library", schema: z.object({ bookId: zs.id(), admissionNo: zs.optStr(30), staffId: zs.optId(), dueDate: zs.date() }) },
  async ({ bookId, admissionNo, staffId, dueDate }, user) => {
    if (!admissionNo && !staffId) throw new UserError("Enter a student admission number or choose a staff member.");
    const student = admissionNo ? await prisma.student.findUnique({ where: { admissionNo: admissionNo.toUpperCase() } }) : null;
    if (admissionNo && (!student || student.status !== "ACTIVE")) throw new UserError("No active student with that admission number.");
    if (dueDate < todayDate()) throw new UserError("Due date is in the past.");
    await prisma.$transaction(async (tx) => {
      const book = await tx.book.findUniqueOrThrow({ where: { id: bookId } });
      const out = await tx.libraryLoan.count({ where: { bookId, returnedAt: null } });
      if (out >= book.copies) throw new UserError("No copies available.");
      if (student) {
        const overdue = await tx.libraryLoan.count({ where: { studentId: student.id, returnedAt: null, dueDate: { lt: todayDate() } } });
        if (overdue) throw new UserError("This student has overdue books. They must be returned first.");
      }
      const loan = await tx.libraryLoan.create({ data: { bookId, studentId: student?.id ?? null, staffId: student ? null : staffId, dueDate, issuedById: user.id } });
      await audit(user.id, "ISSUE_BOOK", "LibraryLoan", loan.id, { bookId, studentId: student?.id, staffId }, tx);
    });
    return { ok: true, message: "Book issued." };
  },
);

export const returnBook = action(
  { permission: "library.manage", revalidate: "/library", schema: z.object({ loanId: zs.id(), waive: zs.bool() }) },
  async ({ loanId, waive }, user) => {
    const loan = await prisma.libraryLoan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.returnedAt) throw new UserError("Already returned.");
    const daysLate = Math.max(0, Math.floor((+todayDate() - +loan.dueDate) / 86400_000));
    const fine = waive ? 0 : daysLate * FINE_PER_DAY;
    await prisma.libraryLoan.update({ where: { id: loanId }, data: { returnedAt: new Date(), fineAmount: fine, finePaid: fine === 0 } });
    await audit(user.id, "RETURN_BOOK", "LibraryLoan", loanId, { daysLate, fine, waive });
    return { ok: true, message: fine ? `Returned ${daysLate} day(s) late. Fine: UGX ${fine.toLocaleString()}.` : "Book returned." };
  },
);

export const payLibraryFine = action(
  { permission: "library.manage", revalidate: "/library", schema: z.object({ loanId: zs.id() }) },
  async ({ loanId }, user) => {
    await prisma.libraryLoan.update({ where: { id: loanId }, data: { finePaid: true } });
    await audit(user.id, "FINE_PAID", "LibraryLoan", loanId);
    return { ok: true, message: "Fine marked as paid." };
  },
);

// ============================== INVENTORY ==============================
export const saveItem = action(
  {
    permission: "inventory.manage", revalidate: "/inventory",
    schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(1).max(30), name: zs.str(150), categoryId: zs.id(), unit: zs.str(20), isAsset: zs.bool(), serialNo: zs.optStr(60), location: zs.optStr(80), condition: zs.optStr(40), unitCost: zs.money().optional(), reorderLevel: zs.money() }),
  },
  async ({ id, ...data }, user) => {
    const i = id ? await prisma.inventoryItem.update({ where: { id }, data }) : await prisma.inventoryItem.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "InventoryItem", i.id, { code: data.code });
    return { ok: true, message: "Item saved." };
  },
);

export const stockMovement = action(
  {
    permission: "inventory.manage", revalidate: "/inventory",
    schema: z.object({ itemId: zs.id(), type: z.enum(["RECEIVED", "ISSUED", "ADJUSTMENT"]), quantity: nonZeroNumber, supplierId: zs.optId(), issuedTo: zs.optStr(120), reference: zs.optStr(60), note: zs.optStr(300), date: zs.date() }),
  },
  async ({ itemId, type, quantity, ...rest }, user) => {
    if (type !== "ADJUSTMENT" && quantity < 0) throw new UserError("Enter a positive quantity.");
    if (type === "ISSUED" && !rest.issuedTo) throw new UserError("Say who the stock was issued to.");
    if (type === "ADJUSTMENT" && !rest.note) throw new UserError("Give a reason for the adjustment (e.g. stock count, damage).");
    const delta = type === "ISSUED" ? -quantity : quantity;
    await prisma.$transaction(async (tx) => {
      // Atomic, non-negative update
      const updated = await tx.$executeRaw`UPDATE "InventoryItem" SET "quantityOnHand" = "quantityOnHand" + ${delta} WHERE id = ${itemId} AND "quantityOnHand" + ${delta} >= 0`;
      if (!updated) throw new UserError("Not enough stock on hand.");
      await tx.stockMovement.create({ data: { itemId, type, quantity: delta, ...rest, recordedById: user.id } });
      await audit(user.id, `STOCK_${type}`, "InventoryItem", itemId, { delta, ...rest }, tx);
    });
    return { ok: true, message: "Stock updated." };
  },
);

// ============================== DISCIPLINE & WELFARE ==============================
async function studentByAdm(adm: string) {
  const s = await prisma.student.findUnique({ where: { admissionNo: adm.trim().toUpperCase() } });
  if (!s) throw new UserError("No student with that admission number.");
  return s;
}

export const saveIncident = action(
  {
    permission: "discipline.manage", revalidate: "/welfare",
    schema: z.object({ admissionNo: zs.str(30), date: zs.date(), category: zs.str(80), severity: z.enum(["MINOR", "MODERATE", "MAJOR"]), description: zs.str(2000), actionTaken: zs.optStr(1000), parentNotified: zs.bool() }),
  },
  async ({ admissionNo, ...data }, user) => {
    const s = await studentByAdm(admissionNo);
    const i = await prisma.disciplineIncident.create({ data: { ...data, studentId: s.id, reportedById: user.id } });
    await audit(user.id, "DISCIPLINE", "DisciplineIncident", i.id, { studentId: s.id, severity: data.severity });
    return { ok: true, message: "Incident recorded." };
  },
);

export const resolveIncident = action(
  { permission: "discipline.manage", revalidate: "/welfare", schema: z.object({ id: zs.id(), actionTaken: zs.str(1000) }) },
  async ({ id, actionTaken }, user) => {
    await prisma.disciplineIncident.update({ where: { id }, data: { status: "RESOLVED", actionTaken } });
    await audit(user.id, "RESOLVE_INCIDENT", "DisciplineIncident", id);
    return { ok: true, message: "Incident resolved." };
  },
);

export const saveCounselling = action(
  { permission: "welfare.confidential", revalidate: "/welfare", schema: z.object({ admissionNo: zs.str(30), date: zs.date(), concern: zs.str(200), notes: zs.str(5000), followUp: zs.optStr(500) }) },
  async ({ admissionNo, ...data }, user) => {
    const s = await studentByAdm(admissionNo);
    const c = await prisma.counsellingRecord.create({ data: { ...data, studentId: s.id, counsellorId: user.id } });
    await audit(user.id, "COUNSELLING", "CounsellingRecord", c.id, { studentId: s.id }); // no content in the audit log
    return { ok: true, message: "Counselling record saved (confidential)." };
  },
);

export const saveMedical = action(
  { permission: "welfare.confidential", revalidate: "/welfare", schema: z.object({ admissionNo: zs.str(30), date: zs.date(), complaint: zs.str(300), treatment: zs.optStr(1000), referredTo: zs.optStr(150), parentNotified: zs.bool() }) },
  async ({ admissionNo, ...data }, user) => {
    const s = await studentByAdm(admissionNo);
    const m = await prisma.medicalIncident.create({ data: { ...data, studentId: s.id, recordedById: user.id } });
    await audit(user.id, "MEDICAL", "MedicalIncident", m.id, { studentId: s.id });
    return { ok: true, message: "Medical record saved." };
  },
);

// ============================== TRANSPORT ==============================
export const saveDriver = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ id: zs.optId(), fullName: zs.str(120), phone: zs.phone(), licenseNo: zs.str(40), licenseExpiry: zs.optDate() }) },
  async ({ id, ...data }, user) => {
    const d = id ? await prisma.driver.update({ where: { id }, data }) : await prisma.driver.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Driver", d.id, { name: data.fullName });
    return { ok: true, message: "Driver saved." };
  },
);

export const saveVehicle = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ id: zs.optId(), regNo: z.string().trim().toUpperCase().min(3).max(15), make: zs.optStr(40), model: zs.optStr(40), capacity: z.coerce.number().int().min(1).max(100), driverId: zs.optId(), status: z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]), insuranceExpiry: zs.optDate() }) },
  async ({ id, ...data }, user) => {
    const v = id ? await prisma.vehicle.update({ where: { id }, data }) : await prisma.vehicle.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Vehicle", v.id, { regNo: data.regNo });
    return { ok: true, message: "Vehicle saved." };
  },
);

export const saveRoute = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ id: zs.optId(), name: zs.str(80), description: zs.optStr(300), termlyFee: zs.money(), vehicleId: zs.optId() }) },
  async ({ id, ...data }, user) => {
    const r = id ? await prisma.transportRoute.update({ where: { id }, data }) : await prisma.transportRoute.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "TransportRoute", r.id, data);
    return { ok: true, message: "Route saved." };
  },
);

export const assignTransport = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ admissionNo: zs.str(30), routeId: zs.id(), termId: zs.id(), pickupPoint: zs.optStr(100), bill: zs.bool() }) },
  async ({ admissionNo, routeId, termId, pickupPoint, bill }, user) => {
    const s = await studentByAdm(admissionNo);
    const route = await prisma.transportRoute.findUniqueOrThrow({ where: { id: routeId }, include: { vehicle: true, _count: { select: { students: { where: { termId } } } } } });
    if (route.vehicle && route._count.students >= route.vehicle.capacity) throw new UserError(`Route is full (vehicle capacity ${route.vehicle.capacity}).`);
    await prisma.$transaction(async (tx) => {
      const existing = await tx.studentTransport.findUnique({ where: { studentId_termId: { studentId: s.id, termId } } });
      if (existing) throw new UserError("Student already has transport this term. Remove it first to change route.");
      let invoiceId: string | null = null;
      if (bill && Number(route.termlyFee) > 0) invoiceId = (await postInvoice(tx, { studentId: s.id, termId, userId: user.id, lines: [{ description: `Transport — ${route.name}`, amount: Number(route.termlyFee) }] })).id;
      await tx.studentTransport.create({ data: { studentId: s.id, routeId, termId, pickupPoint, invoiceId } });
      await audit(user.id, "ASSIGN_TRANSPORT", "StudentTransport", s.id, { routeId, termId, billed: !!invoiceId }, tx);
    });
    return { ok: true, message: `Transport assigned${bill ? " and transport fee invoiced" : ""}.` };
  },
);

export const removeTransport = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const t = await prisma.studentTransport.delete({ where: { id } });
    await audit(user.id, "REMOVE_TRANSPORT", "StudentTransport", id, { studentId: t.studentId, note: t.invoiceId ? "Invoice remains; use a credit adjustment if a refund is due." : undefined });
    return { ok: true, message: t.invoiceId ? "Removed. The transport invoice remains — post a credit adjustment if a refund is due." : "Removed." };
  },
);

export const vehicleLog = action(
  { permission: "transport.manage", revalidate: "/transport", schema: z.object({ vehicleId: zs.id(), kind: z.enum(["MAINTENANCE", "FUEL"]), date: zs.date(), description: zs.optStr(300), cost: zs.positiveMoney(), litres: zs.money().optional(), odometer: zs.optInt(), place: zs.optStr(80) }) },
  async ({ vehicleId, kind, date, description, cost, litres, odometer, place }, user) => {
    if (kind === "MAINTENANCE") {
      if (!description) throw new UserError("Describe the work done.");
      await prisma.vehicleMaintenance.create({ data: { vehicleId, date, description, cost, garage: place, odometer: odometer ?? null } });
    } else {
      if (!litres) throw new UserError("Enter litres.");
      await prisma.fuelRecord.create({ data: { vehicleId, date, litres, cost, odometer: odometer ?? null, station: place } });
    }
    await audit(user.id, `VEHICLE_${kind}`, "Vehicle", vehicleId, { cost });
    return { ok: true, message: `${kind === "FUEL" ? "Fuel" : "Maintenance"} record saved.` };
  },
);

// ============================== UNEB ==============================
export const registerCandidates = action(
  { permission: "uneb.manage", revalidate: "/uneb", schema: z.object({ examLevel: z.enum(["UCE", "UACE"]), year: z.coerce.number().int().min(2020).max(2100) }) },
  async ({ examLevel, year }, user) => {
    const code = examLevel === "UCE" ? "S4" : "S6";
    const cls = await prisma.schoolClass.findUnique({ where: { code } });
    if (!cls) throw new UserError(`Class ${code} not found.`);
    const academicYear = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    const centre = (await prisma.schoolSetting.findUnique({ where: { id: 1 } }))?.[examLevel === "UCE" ? "centreNumberUce" : "centreNumberUace"] ?? null;
    const students = await prisma.student.findMany({ where: { classId: cls.id, status: "ACTIVE" }, include: { subjects: { where: { academicYearId: academicYear?.id } } } });
    let n = 0;
    for (const s of students) {
      const exists = await prisma.unebCandidate.findUnique({ where: { studentId_examLevel_year: { studentId: s.id, examLevel, year } } });
      if (exists) continue;
      await prisma.unebCandidate.create({ data: { studentId: s.id, examLevel, year, centreNo: centre, candidateNo: s.unebIndexNo, subjects: { create: s.subjects.map((x) => ({ subjectId: x.subjectId })) } } });
      n++;
    }
    await audit(user.id, "UNEB_REGISTER", "UnebCandidate", null, { examLevel, year, created: n });
    return { ok: true, message: `${n} candidate record(s) created from ${cls.name} with their current subjects.` };
  },
);

export const updateCandidate = action(
  { permission: "uneb.manage", revalidate: "/uneb", schema: z.object({ id: zs.id(), candidateNo: zs.optStr(20), status: z.enum(["DRAFT", "REGISTERED", "WITHDRAWN"]), feesPaid: zs.bool(), notes: zs.optStr(300) }) },
  async ({ id, candidateNo, ...data }, user) => {
    const c = await prisma.unebCandidate.update({ where: { id }, data: { ...data, candidateNo } });
    if (candidateNo) await prisma.student.update({ where: { id: c.studentId }, data: { unebIndexNo: candidateNo } });
    await audit(user.id, "UNEB_UPDATE", "UnebCandidate", id, { candidateNo, ...data });
    return { ok: true, message: "Candidate updated." };
  },
);

export const updatePractical = action(
  { permission: "uneb.manage", revalidate: "/uneb", schema: z.object({ entryId: zs.id(), practicalDate: zs.optDate(), practicalDone: zs.bool(), practicalNotes: zs.optStr(300), paperCodes: zs.optStr(40) }) },
  async ({ entryId, ...data }, user) => {
    await prisma.unebSubjectEntry.update({ where: { id: entryId }, data });
    await audit(user.id, "UNEB_PRACTICAL", "UnebSubjectEntry", entryId, data);
    return { ok: true, message: "Subject entry updated." };
  },
);
