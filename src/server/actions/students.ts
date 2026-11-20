"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { upperOpt } from "../schemas";
import { fileFrom, saveUpload } from "../storage";
import { generateAdmissionNo, defaultSubjectIds, assertStreamInClass, currentYearOrThrow } from "../students";
import { generateTempPassword, hashPassword } from "../passwords";
import { deleteStudentRecord } from "../deletion";
import { aLevelProblems } from "@/lib/alevel";

const studentFields = {
  admissionNo: upperOpt(30),
  firstName: zs.str(60), lastName: zs.str(60), otherNames: zs.optStr(60),
  gender: z.enum(["MALE", "FEMALE"]), dateOfBirth: zs.optDate(), admissionDate: zs.date(),
  classId: zs.id(), streamId: zs.id(), residence: z.enum(["DAY", "BOARDING"]), combinationId: zs.optId(),
  nationality: zs.optStr(40), religion: zs.optStr(40), homeAddress: zs.optStr(200), previousSchool: zs.optStr(120),
  medicalInfo: zs.optStr(1000), emergencyContactName: zs.optStr(100), emergencyContactPhone: zs.optPhone(),
  unebIndexNo: zs.optStr(30), linNumber: zs.optStr(30), schoolPayCode: zs.optStr(30),
};

export const createStudent = action(
  {
    permission: "students.manage",
    revalidate: "/students",
    schema: z.object({
      ...studentFields,
      gName: zs.optStr(120), gPhone: zs.optPhone(), gEmail: zs.email(), gRelationship: zs.optStr(30), gOccupation: zs.optStr(80),
    }),
  },
  async ({ gName, gPhone, gEmail, gRelationship, gOccupation, ...data }, user, fd) => {
    if (gName && !gPhone) throw new UserError("Enter the parent/guardian telephone number.");
    const photo = fileFrom(fd, "photo");
    const photoFileId = photo ? (await saveUpload(photo, "STUDENT_PHOTO", user.id, { imagesOnly: true })).id : null;
    const student = await prisma.$transaction(async (tx) => {
      await assertStreamInClass(tx, data.classId, data.streamId);
      const year = await currentYearOrThrow(tx);
      const admissionNo = data.admissionNo ?? (await generateAdmissionNo(tx, data.admissionDate.getUTCFullYear()));
      const s = await tx.student.create({ data: { ...data, admissionNo, photoFileId } });
      await tx.enrollment.create({ data: { studentId: s.id, academicYearId: year.id, classId: data.classId, streamId: data.streamId } });
      const subjectIds = await defaultSubjectIds(tx, data.classId, data.combinationId);
      if (subjectIds.length) await tx.studentSubject.createMany({ data: subjectIds.map((subjectId) => ({ studentId: s.id, subjectId, academicYearId: year.id })) });
      if (gName && gPhone) {
        const existing = await tx.guardian.findFirst({ where: { phone: gPhone, fullName: { equals: gName, mode: "insensitive" } } });
        const g = existing ?? (await tx.guardian.create({ data: { fullName: gName, phone: gPhone, email: gEmail, occupation: gOccupation } }));
        await tx.studentGuardian.create({ data: { studentId: s.id, guardianId: g.id, relationship: gRelationship ?? "Parent", isPrimary: true } });
      }
      await audit(user.id, "CREATE", "Student", s.id, { admissionNo }, tx);
      return s;
    });
    return { ok: true, message: `Student registered: ${student.admissionNo}`, redirect: `/students/${student.id}` };
  },
);

export const updateStudent = action(
  { permission: "students.manage", schema: z.object({ id: zs.id(), ...studentFields }) },
  async ({ id, classId, streamId, ...data }, user, fd) => {
    const before = await prisma.student.findUniqueOrThrow({ where: { id } });
    if (classId !== before.classId || streamId !== before.streamId)
      throw new UserError("Use 'Transfer stream' or promotion to change a student's class or stream, so history is kept.");
    const photo = fileFrom(fd, "photo");
    const photoFileId = photo ? (await saveUpload(photo, "STUDENT_PHOTO", user.id, { imagesOnly: true })).id : undefined;
    const admissionNo = data.admissionNo ?? before.admissionNo;
    await prisma.student.update({ where: { id }, data: { ...data, admissionNo, ...(photoFileId ? { photoFileId } : {}) } });
    const changed = Object.fromEntries(Object.entries(data).filter(([k, v]) => String((before as any)[k] ?? "") !== String(v ?? "")).map(([k]) => [k, true]));
    await audit(user.id, "UPDATE", "Student", id, { changed: Object.keys(changed), photoChanged: !!photoFileId });
    return { ok: true, message: "Student record updated.", redirect: `/students/${id}` };
  },
);

export const transferStream = action(
  { permission: "students.manage", schema: z.object({ id: zs.id(), streamId: zs.id(), reason: zs.optStr(200) }) },
  async ({ id, streamId, reason }, user) => {
    await prisma.$transaction(async (tx) => {
      const s = await tx.student.findUniqueOrThrow({ where: { id } });
      await assertStreamInClass(tx, s.classId, streamId);
      const year = await currentYearOrThrow(tx);
      await tx.student.update({ where: { id }, data: { streamId } });
      await tx.enrollment.upsert({
        where: { studentId_academicYearId: { studentId: id, academicYearId: year.id } },
        update: { streamId },
        create: { studentId: id, academicYearId: year.id, classId: s.classId, streamId },
      });
      await audit(user.id, "TRANSFER_STREAM", "Student", id, { from: s.streamId, to: streamId, reason }, tx);
    });
    return { ok: true, message: "Student moved to the new stream." };
  },
);

export const changeStudentStatus = action(
  {
    permission: "students.manage",
    schema: z.object({ id: zs.id(), status: z.enum(["ACTIVE", "SUSPENDED", "WITHDRAWN", "TRANSFERRED", "GRADUATED", "EXPELLED"]), exitDate: zs.optDate(), exitReason: zs.optStr(300) }),
  },
  async ({ id, status, exitDate, exitReason }, user) => {
    const leaving = ["WITHDRAWN", "TRANSFERRED", "GRADUATED", "EXPELLED"].includes(status);
    if (leaving && !exitDate) throw new UserError("Enter the date the student left.");
    await prisma.$transaction(async (tx) => {
      const s = await tx.student.update({ where: { id }, data: { status, exitDate: leaving ? exitDate : null, exitReason: leaving ? exitReason : null } });
      const year = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (year && leaving) {
        await tx.enrollment.updateMany({ where: { studentId: id, academicYearId: year.id }, data: { status: status === "GRADUATED" ? "COMPLETED" : "WITHDRAWN" } });
      }
      // Disable portal access for students who have left
      if (leaving && s.userId) await tx.user.update({ where: { id: s.userId }, data: { isActive: false } });
      await audit(user.id, "CHANGE_STATUS", "Student", id, { status, exitDate, exitReason }, tx);
    });
    return { ok: true, message: `Status changed to ${status.toLowerCase()}.` };
  },
);

export const setStudentSubjects = action(
  { permission: ["students.manage", "academics.manage"], schema: z.object({ id: zs.id(), subjectIds: zs.ids(), combinationId: zs.optId() }) },
  async ({ id, subjectIds, combinationId }, user) => {
    await prisma.$transaction(async (tx) => {
      const year = await currentYearOrThrow(tx);
      const student = await tx.student.findUniqueOrThrow({ where: { id }, include: { schoolClass: true } });
      const subs = await tx.subject.findMany({ where: { id: { in: subjectIds } } });
      if (subs.some((s) => s.level !== student.schoolClass.level)) throw new UserError("All subjects must belong to the student's level.");
      if (student.schoolClass.level === "A_LEVEL") {
        const problems = aLevelProblems(subs);
        if (problems.length) throw new UserError(`S5–S6 take at most 3 principal subjects plus General Paper and either Sub-Maths or Sub-ICT: ${problems.join("; ")}.`);
      }
      await tx.student.update({ where: { id }, data: { combinationId } });
      await tx.studentSubject.deleteMany({ where: { studentId: id, academicYearId: year.id, subjectId: { notIn: subjectIds } } });
      for (const subjectId of subjectIds) {
        await tx.studentSubject.upsert({
          where: { studentId_subjectId_academicYearId: { studentId: id, subjectId, academicYearId: year.id } },
          update: {}, create: { studentId: id, subjectId, academicYearId: year.id },
        });
      }
      await audit(user.id, "SET_SUBJECTS", "Student", id, { subjectIds, combinationId }, tx);
    });
    return { ok: true, message: "Subjects updated for the current year." };
  },
);

/**
 * End-of-year promotion. Each student gets a decision:
 *  PROMOTE → next class (stream with the same name if it exists, else the chosen fallback stream)
 *  REPEAT  → same class in the new year
 *  GRADUATE → status GRADUATED (S4 / S6 leavers)
 * Previous-year enrollment is kept as history.
 */
export const promoteStudents = action(
  {
    permission: "students.manage",
    revalidate: "/students",
    schema: z.object({ fromClassId: zs.id(), toYearId: zs.id(), fallbackStreamId: zs.optId(), decisions: z.string() }),
  },
  async ({ fromClassId, toYearId, fallbackStreamId, decisions }, user) => {
    const map = z.record(z.enum(["PROMOTE", "REPEAT", "GRADUATE", "SKIP"])).parse(JSON.parse(decisions));
    const summary = await prisma.$transaction(async (tx) => {
      const from = await tx.schoolClass.findUniqueOrThrow({ where: { id: fromClassId } });
      const next = await tx.schoolClass.findFirst({ where: { order: from.order + 1, isActive: true }, include: { streams: true } });
      const toYear = await tx.academicYear.findUniqueOrThrow({ where: { id: toYearId } });
      const fromYear = await currentYearOrThrow(tx);
      if (toYear.id === fromYear.id) throw new UserError("Choose the NEW academic year to promote into (it must differ from the current year).");
      const students = await tx.student.findMany({ where: { classId: fromClassId, status: "ACTIVE", id: { in: Object.keys(map) } }, include: { stream: true } });
      const counts = { PROMOTE: 0, REPEAT: 0, GRADUATE: 0, SKIP: 0 };
      for (const s of students) {
        const d = map[s.id];
        counts[d]++;
        if (d === "SKIP") continue;
        if (d === "GRADUATE") {
          await tx.student.update({ where: { id: s.id }, data: { status: "GRADUATED", exitDate: toYear.startDate, exitReason: `Completed ${from.name}` } });
          await tx.enrollment.updateMany({ where: { studentId: s.id, academicYearId: fromYear.id }, data: { status: "COMPLETED" } });
          continue;
        }
        let classId = fromClassId;
        let streamId = s.streamId;
        if (d === "PROMOTE") {
          if (!next) throw new UserError(`${from.name} has no next class; use Graduate for these students.`);
          classId = next.id;
          const same = next.streams.find((x) => x.name === s.stream.name);
          if (same) streamId = same.id;
          else if (fallbackStreamId && next.streams.some((x) => x.id === fallbackStreamId)) streamId = fallbackStreamId;
          else throw new UserError(`${next.name} has no stream "${s.stream.name}". Choose a fallback stream.`);
        }
        await tx.enrollment.updateMany({ where: { studentId: s.id, academicYearId: fromYear.id }, data: { status: d === "PROMOTE" ? "PROMOTED" : "REPEATED" } });
        await tx.enrollment.upsert({
          where: { studentId_academicYearId: { studentId: s.id, academicYearId: toYear.id } },
          update: { classId, streamId, status: "ACTIVE" },
          create: { studentId: s.id, academicYearId: toYear.id, classId, streamId },
        });
        await tx.student.update({ where: { id: s.id }, data: { classId, streamId } });
        // Carry subject enrollment into the new year (O-Level compulsory defaults or same combination)
        const subjectIds = d === "REPEAT"
          ? (await tx.studentSubject.findMany({ where: { studentId: s.id, academicYearId: fromYear.id } })).map((x) => x.subjectId)
          : await defaultSubjectIds(tx, classId, s.combinationId);
        for (const subjectId of subjectIds) {
          await tx.studentSubject.upsert({
            where: { studentId_subjectId_academicYearId: { studentId: s.id, subjectId, academicYearId: toYear.id } },
            update: {}, create: { studentId: s.id, subjectId, academicYearId: toYear.id },
          });
        }
      }
      await audit(user.id, "PROMOTE", "SchoolClass", fromClassId, { toYear: toYear.name, ...counts }, tx);
      return counts;
    }, { timeout: 60_000 });
    return { ok: true, message: `Done: ${summary.PROMOTE} promoted, ${summary.REPEAT} repeating, ${summary.GRADUATE} graduated.` };
  },
);

// ---------------- Guardians ----------------
const guardianFields = { fullName: zs.str(120), phone: zs.phone(), altPhone: zs.optPhone(), email: zs.email(), occupation: zs.optStr(80), address: zs.optStr(200), nationalId: zs.optStr(30) };

export const saveGuardian = action(
  { permission: "guardians.manage", revalidate: "/guardians", schema: z.object({ id: zs.optId(), ...guardianFields, studentId: zs.optId(), relationship: zs.optStr(30), isPrimary: zs.bool() }) },
  async ({ id, studentId, relationship, isPrimary, ...data }, user) => {
    const g = await prisma.$transaction(async (tx) => {
      const g = id ? await tx.guardian.update({ where: { id }, data }) : await tx.guardian.create({ data });
      if (studentId) {
        if (isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
        await tx.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId, guardianId: g.id } },
          update: { relationship: relationship ?? "Parent", isPrimary },
          create: { studentId, guardianId: g.id, relationship: relationship ?? "Parent", isPrimary },
        });
      }
      await audit(user.id, id ? "UPDATE" : "CREATE", "Guardian", g.id, { studentId }, tx);
      return g;
    });
    return { ok: true, message: "Parent/guardian saved.", data: { id: g.id } };
  },
);

export const linkGuardian = action(
  { permission: "guardians.manage", schema: z.object({ studentId: zs.id(), guardianId: zs.id(), relationship: zs.str(30), isPrimary: zs.bool() }) },
  async ({ studentId, guardianId, relationship, isPrimary }, user) => {
    await prisma.$transaction(async (tx) => {
      if (isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId } },
        update: { relationship, isPrimary }, create: { studentId, guardianId, relationship, isPrimary },
      });
      await audit(user.id, "LINK", "StudentGuardian", `${studentId}:${guardianId}`, { relationship }, tx);
    });
    return { ok: true, message: "Guardian linked to student." };
  },
);

export const unlinkGuardian = action(
  { permission: "guardians.manage", schema: z.object({ studentId: zs.id(), guardianId: zs.id() }) },
  async ({ studentId, guardianId }, user) => {
    await prisma.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
    await audit(user.id, "UNLINK", "StudentGuardian", `${studentId}:${guardianId}`);
    return { ok: true, message: "Guardian unlinked." };
  },
);

async function uniqueUsername(base: string) {
  const clean = base.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 30) || "user";
  let name = clean;
  for (let i = 2; await prisma.user.findUnique({ where: { username: name } }); i++) name = `${clean}${i}`;
  return name;
}

export const createGuardianAccount = action(
  { permission: "guardians.manage", schema: z.object({ guardianId: zs.id() }) },
  async ({ guardianId }, user) => {
    const g = await prisma.guardian.findUniqueOrThrow({ where: { id: guardianId } });
    if (g.userId) throw new UserError("This parent already has a portal account. Use Settings → Users to reset the password.");
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "PARENT" } });
    const username = await uniqueUsername(g.phone.replace(/\D/g, "").slice(-9) ? `p${g.phone.replace(/\D/g, "").slice(-9)}` : g.fullName);
    const temp = generateTempPassword();
    const emailTaken = g.email ? await prisma.user.findUnique({ where: { email: g.email } }) : null;
    const u = await prisma.user.create({
      data: {
        username, fullName: g.fullName, email: emailTaken ? null : g.email, phone: g.phone, passwordHash: await hashPassword(temp),
        mustChangePassword: true, roles: { create: [{ roleId: role.id }] }, guardian: { connect: { id: g.id } },
      },
    });
    await audit(user.id, "CREATE_PORTAL_ACCOUNT", "Guardian", g.id, { userId: u.id, username });
    return { ok: true, message: `Parent portal account created. Username: ${username} · Temporary password: ${temp}` };
  },
);

export const createStudentAccount = action(
  { permission: "students.manage", schema: z.object({ studentId: zs.id() }) },
  async ({ studentId }, user) => {
    const s = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    if (s.userId) throw new UserError("This student already has a portal account.");
    if (s.status !== "ACTIVE") throw new UserError("Only active students can have portal accounts.");
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "STUDENT" } });
    const username = await uniqueUsername(s.admissionNo.replace(/\//g, "."));
    const temp = generateTempPassword();
    const u = await prisma.user.create({
      data: {
        username, fullName: `${s.firstName} ${s.lastName}`, passwordHash: await hashPassword(temp), mustChangePassword: true,
        roles: { create: [{ roleId: role.id }] }, student: { connect: { id: s.id } },
      },
    });
    await audit(user.id, "CREATE_PORTAL_ACCOUNT", "Student", s.id, { userId: u.id, username });
    return { ok: true, message: `Student portal account created. Username: ${username} · Temporary password: ${temp}` };
  },
);

export const deleteStudent = action(
  { permission: "students.manage", revalidate: "/students", schema: z.object({ id: zs.id(), fromProfile: zs.bool() }) },
  async ({ id, fromProfile }, user) => {
    const s = await deleteStudentRecord(id, user.id);
    const message = `${s.firstName} ${s.lastName} (${s.admissionNo}) was deleted.`;
    return { ok: true, message, ...(fromProfile ? { serverRedirect: "/students?deleted=1" } : {}) };
  },
);

const bulkRow = z.object({
  id: zs.id(),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  firstName: z.string().trim().min(1, "First name is required").max(60),
  otherNames: z.string().trim().max(60).optional().default(""),
  gender: z.enum(["MALE", "FEMALE"]),
  streamId: zs.id(),
  residence: z.enum(["DAY", "BOARDING"]),
  linNumber: z.string().trim().max(30).optional().default(""),
  schoolPayCode: z.string().trim().max(30).optional().default(""),
  combinationId: z.string().max(40).optional().default(""),
  electives: z.array(z.string().max(40)).max(60),
});

/**
 * Bulk edit of one class (Students → Bulk edit): names, gender, stream, day/boarding, LIN, SchoolPay code,
 * A-Level combination and elective subjects for the current year. Only the rows the page marks as changed are sent.
 * Compulsory subjects are never touched. Stream changes also update the current-year enrollment (as Transfer stream).
 */
export const bulkUpdateStudents = action(
  { permission: "students.manage", revalidate: "/students", schema: z.object({ classId: zs.id(), rows: z.string().max(2_000_000) }) },
  async ({ classId, rows: raw }, user) => {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new UserError("Could not read the changes. Reload the page and try again."); }
    const rows = z.array(bulkRow).max(1000).parse(parsed);
    if (!rows.length) return { ok: true, message: "No changes to save." };
    const n = await prisma.$transaction(async (tx) => {
      const year = await currentYearOrThrow(tx);
      const cls = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { streams: true } });
      const streamIds = new Set(cls.streams.map((s) => s.id));
      // Only non-compulsory subjects of this level can be ticked here.
      const levelSubjects = await tx.subject.findMany({ where: { level: cls.level, category: { not: "COMPULSORY" } }, select: { id: true, code: true, name: true, category: true } });
      const electiveIds = new Set(levelSubjects.map((s) => s.id));
      const comboIds = new Set((await tx.subjectCombination.findMany({ select: { id: true } })).map((c) => c.id));
      const before = new Map((await tx.student.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
        include: { subjects: { where: { academicYearId: year.id }, select: { subjectId: true } } },
      })).map((s) => [s.id, s]));
      let changedStudents = 0;
      for (const r of rows) {
        const b = before.get(r.id);
        const who = `${r.lastName} ${r.firstName}`;
        if (!b || b.classId !== classId) throw new UserError(`${who} is not in ${cls.name}. Reload the page.`);
        if (!streamIds.has(r.streamId)) throw new UserError(`${who}: choose a stream of ${cls.name}.`);
        const bad = r.electives.find((id) => !electiveIds.has(id));
        if (bad) throw new UserError(`${who}: one of the ticked subjects is not an elective for ${cls.name}.`);
        const combinationId = cls.level === "A_LEVEL" ? (r.combinationId || null) : b.combinationId;
        if (combinationId && combinationId !== b.combinationId && !comboIds.has(combinationId)) throw new UserError(`${who}: unknown combination.`);
        if (cls.level === "A_LEVEL") {
          const problems = aLevelProblems(levelSubjects.filter((x) => r.electives.includes(x.id)));
          if (problems.length) throw new UserError(`${who}: ${problems.join("; ")} (S5–S6: max 3 principals + General Paper + Sub-Maths or Sub-ICT).`);
        }

        const data = {
          lastName: r.lastName, firstName: r.firstName, otherNames: r.otherNames || null, gender: r.gender, residence: r.residence,
          linNumber: r.linNumber || null, schoolPayCode: r.schoolPayCode || null, combinationId,
        };
        const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => String(b[k] ?? "") !== String(data[k] ?? ""));
        const streamChanged = r.streamId !== b.streamId;
        const had = new Set(b.subjects.map((s) => s.subjectId).filter((id) => electiveIds.has(id)));
        const want = new Set(r.electives);
        const add = [...want].filter((id) => !had.has(id));
        const remove = [...had].filter((id) => !want.has(id));
        if (!changed.length && !streamChanged && !add.length && !remove.length) continue;
        changedStudents++;

        if (changed.length || streamChanged) await tx.student.update({ where: { id: r.id }, data: { ...data, streamId: r.streamId } });
        if (changed.length) await audit(user.id, "UPDATE", "Student", r.id, { changed, via: "bulk edit" }, tx);
        if (streamChanged) {
          await tx.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: r.id, academicYearId: year.id } },
            update: { streamId: r.streamId },
            create: { studentId: r.id, academicYearId: year.id, classId, streamId: r.streamId },
          });
          await audit(user.id, "TRANSFER_STREAM", "Student", r.id, { from: b.streamId, to: r.streamId, reason: "bulk edit" }, tx);
        }
        if (add.length || remove.length) {
          if (remove.length) await tx.studentSubject.deleteMany({ where: { studentId: r.id, academicYearId: year.id, subjectId: { in: remove } } });
          if (add.length) await tx.studentSubject.createMany({ data: add.map((subjectId) => ({ studentId: r.id, subjectId, academicYearId: year.id })), skipDuplicates: true });
          await audit(user.id, "SET_SUBJECTS", "Student", r.id, { added: add, removed: remove, via: "bulk edit" }, tx);
        }
      }
      return changedStudents;
    }, { timeout: 60_000 });
    return { ok: true, message: n ? `Saved changes for ${n} student${n === 1 ? "" : "s"}.` : "No changes to save." };
  },
);

/** Students → Photos: set one student's passport photo (already resized in the browser). The replaced photo file is removed. */
export const setStudentPhoto = action(
  { permission: "students.manage", schema: z.object({ id: zs.id() }) },
  async ({ id }, user, fd) => {
    const photo = fileFrom(fd, "photo");
    if (!photo) throw new UserError("Choose a photo.");
    const before = await prisma.student.findUniqueOrThrow({ where: { id }, select: { photoFileId: true, admissionNo: true } });
    const saved = await saveUpload(photo, "STUDENT_PHOTO", user.id, { imagesOnly: true });
    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: { photoFileId: saved.id } });
      if (before.photoFileId) await tx.storedFile.deleteMany({ where: { id: before.photoFileId } });
      await audit(user.id, "SET_PHOTO", "Student", id, { replaced: !!before.photoFileId }, tx);
    });
    return { ok: true, message: `Photo saved for ${before.admissionNo}.`, data: { fileId: saved.id } };
  },
);

export const removeStudentPhoto = action(
  { permission: "students.manage", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    await prisma.$transaction(async (tx) => {
      const s = await tx.student.findUniqueOrThrow({ where: { id }, select: { photoFileId: true } });
      if (!s.photoFileId) return;
      await tx.student.update({ where: { id }, data: { photoFileId: null } });
      await tx.storedFile.deleteMany({ where: { id: s.photoFileId } });
      await audit(user.id, "REMOVE_PHOTO", "Student", id, {}, tx);
    });
    return { ok: true, message: "Photo removed." };
  },
);

/** Data check: give every active student with no subjects this year their class's default subjects (O-Level compulsory; A-Level from the combination). */
export const fixMissingSubjects = action(
  { permission: "students.manage", revalidate: "/students", schema: z.object({}) },
  async (_d, user) => {
    const year = await currentYearOrThrow(prisma);
    const list = await prisma.student.findMany({ where: { status: "ACTIVE", subjects: { none: { academicYearId: year.id } } }, select: { id: true, classId: true, combinationId: true } });
    let fixed = 0, skipped = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of list) {
        const ids = await defaultSubjectIds(tx, s.classId, s.combinationId);
        if (!ids.length) { skipped++; continue; }
        await tx.studentSubject.createMany({ data: ids.map((subjectId) => ({ studentId: s.id, subjectId, academicYearId: year.id })), skipDuplicates: true });
        fixed++;
      }
      await audit(user.id, "DATA_FIX_SUBJECTS", "Student", null, { fixed, skipped, year: year.name }, tx);
    }, { timeout: 60_000 });
    return { ok: true, message: `${fixed} student(s) given their class's default subjects.${skipped ? ` ${skipped} A-Level student(s) need a combination first.` : ""} Add electives in Bulk edit.` };
  },
);

/** Data check: create this year's enrolment record (class and stream) for active students who have none. */
export const fixMissingEnrollments = action(
  { permission: "students.manage", revalidate: "/students", schema: z.object({}) },
  async (_d, user) => {
    const year = await currentYearOrThrow(prisma);
    const list = await prisma.student.findMany({ where: { status: "ACTIVE", enrollments: { none: { academicYearId: year.id } } }, select: { id: true, classId: true, streamId: true } });
    if (list.length) await prisma.enrollment.createMany({ data: list.map((s) => ({ studentId: s.id, academicYearId: year.id, classId: s.classId, streamId: s.streamId })), skipDuplicates: true });
    await audit(user.id, "DATA_FIX_ENROLMENTS", "Student", null, { created: list.length, year: year.name });
    return { ok: true, message: `${list.length} enrolment record(s) created for ${year.name}.` };
  },
);
