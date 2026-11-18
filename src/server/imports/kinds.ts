import "server-only";
import type { PermissionCode } from "@/lib/permissions";
import { prisma, type Tx } from "@/lib/db";
import type { CurrentUser } from "../auth";
import { type Column, parseDate, parseGender, parseNumber } from "./excel";
import { generateAdmissionNo, defaultSubjectIds } from "../students";
import { postAdjustment } from "../fees/ledger";
import { parseMarkInput, saveMarks, type MarkEntry } from "../exams/marks";
import { studentName } from "@/lib/utils";

export type Ctx = Record<string, string>;
export type CheckedRow = { rowNumber: number; values: Record<string, string>; errors: string[]; data?: any };

export interface ImportKind {
  title: string;
  permission: PermissionCode[];
  columns: Column[];
  instructions: string[];
  contextKeys?: string[];
  /** Pre-filled rows for the template (e.g. the stream's students for marks). */
  templateRows?: (ctx: Ctx) => Promise<Record<string, string | number>[]>;
  check: (rows: { rowNumber: number; values: Record<string, string> }[], ctx: Ctx) => Promise<CheckedRow[]>;
  commit: (tx: Tx, rows: CheckedRow[], ctx: Ctx, user: CurrentUser) => Promise<string>;
}

function dupes(rows: { rowNumber: number; values: Record<string, string> }[], key: string) {
  const seen = new Map<string, number>();
  const out = new Map<number, string>();
  for (const r of rows) {
    const v = (r.values[key] ?? "").trim().toUpperCase();
    if (!v) continue;
    if (seen.has(v)) out.set(r.rowNumber, `Duplicate of row ${seen.get(v)} in this file`);
    else seen.set(v, r.rowNumber);
  }
  return out;
}

// ---------------------------------------------------------------- Students
const students: ImportKind = {
  title: "Student registration",
  permission: ["students.import"],
  instructions: [
    "One student per row. Dates as YYYY-MM-DD or DD/MM/YYYY.",
    "Leave Admission No blank to generate one automatically.",
    "Class is the class code (S1–S6); Stream is the stream name as set up in Settings (e.g. A).",
    "If a guardian with the same name and phone already exists the student is linked to them.",
  ],
  columns: [
    { key: "admissionNo", header: "Admission No", note: "Leave blank to auto-generate" },
    { key: "lastName", header: "Surname", required: true, example: "Okello" },
    { key: "firstName", header: "First Name", required: true, example: "Peter" },
    { key: "otherNames", header: "Other Names" },
    { key: "gender", header: "Gender", required: true, options: ["M", "F"] },
    { key: "dateOfBirth", header: "Date of Birth", example: "2011-03-14" },
    { key: "classCode", header: "Class", required: true, options: ["S1", "S2", "S3", "S4", "S5", "S6"] },
    { key: "stream", header: "Stream", required: true, example: "A" },
    { key: "residence", header: "Day/Boarding", required: true, options: ["DAY", "BOARDING"] },
    { key: "combination", header: "Combination", note: "A-Level only, e.g. PCM" },
    { key: "admissionDate", header: "Admission Date", example: "2026-02-02", note: "Defaults to today" },
    { key: "previousSchool", header: "Previous School" },
    { key: "unebIndexNo", header: "UNEB Index No" },
    { key: "guardianName", header: "Guardian Name" },
    { key: "guardianPhone", header: "Guardian Phone", example: "0772000000" },
    { key: "guardianRelationship", header: "Relationship", options: ["Father", "Mother", "Guardian", "Sponsor", "Other"] },
    { key: "guardianEmail", header: "Guardian Email" },
    { key: "medicalInfo", header: "Medical Info" },
  ],
  async check(rows) {
    const [classes, combos, existing] = await Promise.all([
      prisma.schoolClass.findMany({ include: { streams: true } }),
      prisma.subjectCombination.findMany(),
      prisma.student.findMany({ where: { admissionNo: { in: rows.map((r) => r.values.admissionNo?.toUpperCase()).filter(Boolean) } }, select: { admissionNo: true } }),
    ]);
    const taken = new Set(existing.map((e) => e.admissionNo));
    const dup = dupes(rows, "admissionNo");
    // Also flag likely duplicate people (same name + DOB) inside the file
    const people = new Map<string, number>();
    return rows.map((r) => {
      const v = r.values;
      const errors: string[] = [];
      if (dup.has(r.rowNumber)) errors.push(dup.get(r.rowNumber)!);
      const admissionNo = v.admissionNo?.toUpperCase() || undefined;
      if (admissionNo && taken.has(admissionNo)) errors.push(`Admission No ${admissionNo} already exists`);
      if (!v.lastName) errors.push("Surname is missing");
      if (!v.firstName) errors.push("First name is missing");
      const gender = parseGender(v.gender ?? "");
      if (!gender) errors.push("Gender must be M or F");
      const dob = v.dateOfBirth ? parseDate(v.dateOfBirth) : null;
      if (v.dateOfBirth && !dob) errors.push("Date of birth is not a valid date");
      const admissionDate = v.admissionDate ? parseDate(v.admissionDate) : new Date(new Date().toISOString().slice(0, 10));
      if (!admissionDate) errors.push("Admission date is not a valid date");
      const cls = classes.find((c) => c.code.toUpperCase() === (v.classCode ?? "").toUpperCase());
      if (!cls) errors.push(`Unknown class "${v.classCode ?? ""}"`);
      const stream = cls?.streams.find((s) => s.name.toUpperCase() === (v.stream ?? "").toUpperCase());
      if (cls && !stream) errors.push(`${cls.code} has no stream "${v.stream ?? ""}"`);
      const residence = (v.residence ?? "").toUpperCase().startsWith("B") ? "BOARDING" : (v.residence ?? "").toUpperCase().startsWith("D") ? "DAY" : null;
      if (!residence) errors.push("Day/Boarding must be DAY or BOARDING");
      const combo = v.combination ? combos.find((c) => c.code.toUpperCase() === v.combination.toUpperCase()) : null;
      if (v.combination && !combo) errors.push(`Unknown combination "${v.combination}"`);
      if (cls?.level === "A_LEVEL" && !combo) errors.push("A-Level students need a combination");
      if (v.guardianName && !v.guardianPhone) errors.push("Guardian phone is missing");
      if (v.guardianPhone && !/^\+?[0-9 ()-]{9,20}$/.test(v.guardianPhone)) errors.push("Guardian phone is not valid");
      const key = `${(v.lastName ?? "").toUpperCase()}|${(v.firstName ?? "").toUpperCase()}|${v.dateOfBirth ?? ""}`;
      if (v.dateOfBirth && people.has(key)) errors.push(`Same name and date of birth as row ${people.get(key)}`);
      else people.set(key, r.rowNumber);
      return {
        ...r, errors,
        data: errors.length ? undefined : {
          admissionNo, lastName: v.lastName, firstName: v.firstName, otherNames: v.otherNames || null, gender, dateOfBirth: dob, admissionDate,
          classId: cls!.id, streamId: stream!.id, residence, combinationId: combo?.id ?? null, previousSchool: v.previousSchool || null,
          unebIndexNo: v.unebIndexNo || null, medicalInfo: v.medicalInfo || null,
          guardian: v.guardianName ? { fullName: v.guardianName, phone: v.guardianPhone, email: v.guardianEmail || null, relationship: v.guardianRelationship || "Parent" } : null,
        },
      };
    });
  },
  async commit(tx, rows) {
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new Error("Set a current academic year first.");
    for (const r of rows) {
      const { guardian, ...d } = r.data;
      const admissionNo = d.admissionNo ?? (await generateAdmissionNo(tx, d.admissionDate.getUTCFullYear()));
      const s = await tx.student.create({ data: { ...d, admissionNo } });
      await tx.enrollment.create({ data: { studentId: s.id, academicYearId: year.id, classId: d.classId, streamId: d.streamId } });
      const subjectIds = await defaultSubjectIds(tx, d.classId, d.combinationId);
      if (subjectIds.length) await tx.studentSubject.createMany({ data: subjectIds.map((subjectId) => ({ studentId: s.id, subjectId, academicYearId: year.id })) });
      if (guardian) {
        const g = (await tx.guardian.findFirst({ where: { phone: guardian.phone, fullName: { equals: guardian.fullName, mode: "insensitive" } } }))
          ?? (await tx.guardian.create({ data: { fullName: guardian.fullName, phone: guardian.phone, email: guardian.email } }));
        await tx.studentGuardian.create({ data: { studentId: s.id, guardianId: g.id, relationship: guardian.relationship, isPrimary: true } });
      }
    }
    return `${rows.length} students registered.`;
  },
};

// ---------------------------------------------------------------- Staff
const staff: ImportKind = {
  title: "Staff records",
  permission: ["staff.manage"],
  instructions: ["One staff member per row. Staff No must be unique.", "Department must match a department in Settings → Lists."],
  columns: [
    { key: "staffNo", header: "Staff No", required: true, example: "BOHS-T-001" },
    { key: "lastName", header: "Surname", required: true },
    { key: "firstName", header: "First Name", required: true },
    { key: "gender", header: "Gender", required: true, options: ["M", "F"] },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "designation", header: "Designation", required: true, example: "Teacher" },
    { key: "department", header: "Department" },
    { key: "isTeaching", header: "Teaching Staff", options: ["YES", "NO"] },
    { key: "employmentType", header: "Employment Type", options: ["PERMANENT", "CONTRACT", "PART_TIME", "VOLUNTEER"] },
    { key: "dateJoined", header: "Date Joined" },
    { key: "subjects", header: "Teaching Subjects", note: "Subject codes separated by commas, e.g. MTC,PHY" },
  ],
  async check(rows) {
    const [depts, existing, subjects] = await Promise.all([
      prisma.department.findMany(),
      prisma.staff.findMany({ where: { staffNo: { in: rows.map((r) => r.values.staffNo?.toUpperCase()).filter(Boolean) } }, select: { staffNo: true } }),
      prisma.subject.findMany({ select: { id: true, code: true } }),
    ]);
    const taken = new Set(existing.map((e) => e.staffNo));
    const dup = dupes(rows, "staffNo");
    return rows.map((r) => {
      const v = r.values;
      const errors: string[] = [];
      const staffNo = (v.staffNo ?? "").toUpperCase();
      if (!staffNo) errors.push("Staff No is missing");
      if (dup.has(r.rowNumber)) errors.push(dup.get(r.rowNumber)!);
      if (taken.has(staffNo)) errors.push(`Staff No ${staffNo} already exists`);
      if (!v.lastName || !v.firstName) errors.push("Name is incomplete");
      const gender = parseGender(v.gender ?? "");
      if (!gender) errors.push("Gender must be M or F");
      if (!v.designation) errors.push("Designation is missing");
      const dept = v.department ? depts.find((d) => d.name.toLowerCase() === v.department.toLowerCase()) : null;
      if (v.department && !dept) errors.push(`Unknown department "${v.department}"`);
      const dateJoined = v.dateJoined ? parseDate(v.dateJoined) : null;
      if (v.dateJoined && !dateJoined) errors.push("Date joined is not valid");
      if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) errors.push("Email is not valid");
      const codes = (v.subjects ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const subjectIds = codes.map((c) => subjects.find((s) => s.code === c)?.id);
      if (subjectIds.some((x) => !x)) errors.push(`Unknown subject code(s): ${codes.filter((_, i) => !subjectIds[i]).join(", ")}`);
      const employmentType = (v.employmentType || "PERMANENT").toUpperCase();
      if (!["PERMANENT", "CONTRACT", "PART_TIME", "VOLUNTEER"].includes(employmentType)) errors.push("Invalid employment type");
      return {
        ...r, errors,
        data: errors.length ? undefined : {
          staffNo, lastName: v.lastName, firstName: v.firstName, gender, phone: v.phone || null, email: v.email || null, designation: v.designation,
          departmentId: dept?.id ?? null, isTeaching: !/^n/i.test(v.isTeaching ?? "yes"), employmentType, dateJoined, subjectIds,
        },
      };
    });
  },
  async commit(tx, rows) {
    for (const r of rows) {
      const { subjectIds, ...d } = r.data;
      await tx.staff.create({ data: { ...d, subjects: { create: (subjectIds as string[]).map((subjectId) => ({ subjectId })) } } });
    }
    return `${rows.length} staff records created.`;
  },
};

// ---------------------------------------------------------------- Fee opening balances
const openingBalances: ImportKind = {
  title: "Fees opening balances",
  permission: ["fees.reverse"],
  instructions: [
    "Use this once when moving from the old system: each row posts an OPENING BALANCE to the student's fees account.",
    "Positive amounts = the student owes the school. For prepaid credit use a negative amount.",
  ],
  columns: [
    { key: "admissionNo", header: "Admission No", required: true },
    { key: "studentName", header: "Student Name", note: "For your reference only" },
    { key: "amount", header: "Amount (UGX)", required: true, example: "350000" },
    { key: "reason", header: "Note", example: "Balance brought forward 2025" },
  ],
  async check(rows) {
    const studentsFound = await prisma.student.findMany({ where: { admissionNo: { in: rows.map((r) => (r.values.admissionNo ?? "").toUpperCase()) } }, select: { id: true, admissionNo: true } });
    const byAdm = new Map(studentsFound.map((s) => [s.admissionNo, s.id]));
    const already = new Set((await prisma.feeAdjustment.findMany({ where: { type: "OPENING_BALANCE", studentId: { in: studentsFound.map((s) => s.id) } }, select: { studentId: true } })).map((x) => x.studentId));
    const dup = dupes(rows, "admissionNo");
    return rows.map((r) => {
      const errors: string[] = [];
      const id = byAdm.get((r.values.admissionNo ?? "").toUpperCase());
      if (!id) errors.push(`No student with admission no "${r.values.admissionNo}"`);
      if (dup.has(r.rowNumber)) errors.push(dup.get(r.rowNumber)!);
      if (id && already.has(id)) errors.push("This student already has an opening balance");
      const amount = parseNumber(r.values.amount ?? "");
      if (amount === null || amount === 0) errors.push("Amount must be a non-zero number");
      return { ...r, errors, data: errors.length ? undefined : { studentId: id, amount, reason: r.values.reason || "Opening balance" } };
    });
  },
  async commit(tx, rows, _ctx, user) {
    const term = await tx.term.findFirst({ where: { isCurrent: true } });
    for (const r of rows) {
      const { studentId, amount, reason } = r.data;
      await postAdjustment(tx, { studentId, termId: term?.id ?? null, type: amount > 0 ? "OPENING_BALANCE" : "CREDIT_ADJUSTMENT", amount: Math.abs(amount), reason, userId: user.id });
    }
    return `${rows.length} opening balances posted.`;
  },
};

// ---------------------------------------------------------------- Subject allocations
const allocations: ImportKind = {
  title: "Subject teacher allocation",
  permission: ["academics.manage"],
  instructions: ["Allocates teachers to subjects in streams for the CURRENT academic year."],
  columns: [
    { key: "staffNo", header: "Staff No", required: true },
    { key: "subjectCode", header: "Subject Code", required: true, example: "MTC" },
    { key: "classCode", header: "Class", required: true, options: ["S1", "S2", "S3", "S4", "S5", "S6"] },
    { key: "stream", header: "Stream", required: true, example: "A" },
  ],
  async check(rows) {
    const [staffList, subjects, classes] = await Promise.all([
      prisma.staff.findMany({ select: { id: true, staffNo: true } }), prisma.subject.findMany(), prisma.schoolClass.findMany({ include: { streams: true } }),
    ]);
    const seen = new Set<string>();
    return rows.map((r) => {
      const v = r.values;
      const errors: string[] = [];
      const st = staffList.find((s) => s.staffNo === (v.staffNo ?? "").toUpperCase());
      if (!st) errors.push(`Unknown staff no "${v.staffNo}"`);
      const sub = subjects.find((s) => s.code === (v.subjectCode ?? "").toUpperCase());
      if (!sub) errors.push(`Unknown subject "${v.subjectCode}"`);
      const cls = classes.find((c) => c.code === (v.classCode ?? "").toUpperCase());
      const stream = cls?.streams.find((s) => s.name.toUpperCase() === (v.stream ?? "").toUpperCase());
      if (!stream) errors.push(`Unknown stream "${v.classCode} ${v.stream}"`);
      if (sub && cls && sub.level !== cls.level) errors.push(`${sub.code} is not a ${cls.level === "O_LEVEL" ? "O-Level" : "A-Level"} subject`);
      const key = `${st?.id}|${sub?.id}|${stream?.id}`;
      if (seen.has(key)) errors.push("Duplicate allocation in this file");
      seen.add(key);
      return { ...r, errors, data: errors.length ? undefined : { staffId: st!.id, subjectId: sub!.id, streamId: stream!.id } };
    });
  },
  async commit(tx, rows) {
    const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new Error("No current academic year.");
    let created = 0;
    for (const r of rows) {
      const res = await tx.teacherAllocation.upsert({
        where: { staffId_subjectId_streamId_academicYearId: { ...r.data, academicYearId: year.id } },
        update: {}, create: { ...r.data, academicYearId: year.id },
      });
      if (res) created++;
    }
    return `${created} allocations saved.`;
  },
};

// ---------------------------------------------------------------- Attendance
const attendance: ImportKind = {
  title: "Student attendance",
  permission: ["attendance.take"],
  instructions: ["One row per student per day. Status: P (present), A (absent), L (late), E (excused).", "Existing records for the same student and date are updated."],
  columns: [
    { key: "admissionNo", header: "Admission No", required: true },
    { key: "date", header: "Date", required: true, example: "2026-11-18" },
    { key: "status", header: "Status", required: true, options: ["P", "A", "L", "E"] },
    { key: "remark", header: "Remark" },
  ],
  async check(rows) {
    const list = await prisma.student.findMany({ where: { admissionNo: { in: rows.map((r) => (r.values.admissionNo ?? "").toUpperCase()) } }, select: { id: true, admissionNo: true, streamId: true, status: true } });
    const by = new Map(list.map((s) => [s.admissionNo, s]));
    const seen = new Set<string>();
    const map: Record<string, string> = { P: "PRESENT", PRESENT: "PRESENT", A: "ABSENT", ABSENT: "ABSENT", L: "LATE", LATE: "LATE", E: "EXCUSED", EXCUSED: "EXCUSED" };
    return rows.map((r) => {
      const errors: string[] = [];
      const s = by.get((r.values.admissionNo ?? "").toUpperCase());
      if (!s) errors.push(`No student "${r.values.admissionNo}"`);
      const date = parseDate(r.values.date ?? "");
      if (!date) errors.push("Invalid date");
      else if (date > new Date()) errors.push("Date is in the future");
      const status = map[(r.values.status ?? "").toUpperCase()];
      if (!status) errors.push("Status must be P, A, L or E");
      const key = `${s?.id}|${date?.toISOString()}`;
      if (seen.has(key)) errors.push("Duplicate student/date in this file");
      seen.add(key);
      return { ...r, errors, data: errors.length ? undefined : { studentId: s!.id, streamId: s!.streamId, date, status, remark: r.values.remark || null } };
    });
  },
  async commit(tx, rows, _ctx, user) {
    for (const r of rows) {
      const { studentId, date, ...rest } = r.data;
      const d = new Date(date);
      await tx.studentAttendance.upsert({
        where: { studentId_date: { studentId, date: d } },
        update: { ...rest, recordedById: user.id },
        create: { studentId, date: d, ...rest, recordedById: user.id },
      });
    }
    return `${rows.length} attendance records saved.`;
  },
};

// ---------------------------------------------------------------- Marks
const marks: ImportKind = {
  title: "Examination marks",
  permission: ["marks.enter", "marks.enter.any"],
  contextKeys: ["examId", "streamId", "subjectId"],
  instructions: [
    "Download this template from the marks entry page: it is pre-filled with the students in the stream who take the subject.",
    "Enter a number for the mark, ABS for absent, EX for exempted. Leave blank if the mark is not yet available.",
    "Do not change the Admission No column.",
  ],
  columns: [
    { key: "admissionNo", header: "Admission No", required: true },
    { key: "name", header: "Student Name" },
    { key: "mark", header: "Mark", required: true, note: "Number, ABS or EX" },
  ],
  async templateRows(ctx) {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: ctx.examId }, include: { term: true } });
    const list = await prisma.student.findMany({
      where: { streamId: ctx.streamId, status: "ACTIVE", subjects: { some: { subjectId: ctx.subjectId, academicYearId: exam.term.academicYearId } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { marks: { where: { examId: ctx.examId, subjectId: ctx.subjectId } } },
    });
    return list.map((s) => {
      const m = s.marks[0];
      return { admissionNo: s.admissionNo, name: studentName(s), mark: !m ? "" : m.status === "PRESENT" ? Number(m.score) : m.status === "ABSENT" ? "ABS" : "EX" };
    });
  },
  async check(rows, ctx) {
    const exam = await prisma.exam.findUnique({ where: { id: ctx.examId }, include: { term: true } });
    const stream = await prisma.stream.findUnique({ where: { id: ctx.streamId } });
    if (!exam || !stream) return rows.map((r) => ({ ...r, errors: ["Exam or stream not found"] }));
    const es = await prisma.examSubject.findUnique({ where: { examId_classId_subjectId: { examId: exam.id, classId: stream.classId, subjectId: ctx.subjectId } } });
    const max = es ? Number(es.maxMarks) : 100;
    const list = await prisma.student.findMany({
      where: { streamId: ctx.streamId, subjects: { some: { subjectId: ctx.subjectId, academicYearId: exam.term.academicYearId } } },
      select: { id: true, admissionNo: true },
    });
    const by = new Map(list.map((s) => [s.admissionNo, s.id]));
    const dup = dupes(rows, "admissionNo");
    return rows.map((r) => {
      const errors: string[] = [];
      if (!es) errors.push("Subject is not configured for this class in the exam");
      const id = by.get((r.values.admissionNo ?? "").toUpperCase());
      if (!id) errors.push(`Student "${r.values.admissionNo}" is not in this stream or does not take the subject`);
      if (dup.has(r.rowNumber)) errors.push(dup.get(r.rowNumber)!);
      const parsed = parseMarkInput(r.values.mark ?? "");
      if (parsed === "invalid") errors.push(`"${r.values.mark}" is not a valid mark`);
      else if (parsed?.status === "PRESENT" && (parsed.score! < 0 || parsed.score! > max)) errors.push(`Mark must be between 0 and ${max}`);
      if (parsed === null) return { ...r, errors, data: errors.length ? undefined : { skip: true } };
      return { ...r, errors, data: errors.length || parsed === "invalid" ? undefined : { studentId: id, ...parsed } };
    });
  },
  async commit(tx, rows, ctx, user) {
    const entries: MarkEntry[] = rows.filter((r) => !r.data.skip).map((r) => ({ studentId: r.data.studentId, score: r.data.score, status: r.data.status }));
    const n = await saveMarks(tx, { examId: ctx.examId, streamId: ctx.streamId, subjectId: ctx.subjectId, entries, clear: [], user });
    return `${entries.length} marks imported (${n} changed).`;
  },
};

export const IMPORT_KINDS: Record<string, ImportKind> = { students, staff, opening_balances: openingBalances, allocations, attendance, marks };
