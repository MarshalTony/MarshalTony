"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { optNumber } from "../schemas";
import { can } from "../auth";
import { fileFrom, saveUpload } from "../storage";
import { generateTempPassword, hashPassword } from "../passwords";
import { deleteStaffRecord } from "../deletion";

const fields = {
  staffNo: z.string().trim().toUpperCase().min(1).max(30), firstName: zs.str(60), lastName: zs.str(60), otherNames: zs.optStr(60),
  gender: z.enum(["MALE", "FEMALE"]), dateOfBirth: zs.optDate(), phone: zs.optPhone(), email: zs.email(), nationalId: zs.optStr(30),
  address: zs.optStr(200), departmentId: zs.optId(), designation: zs.str(80), isTeaching: zs.bool(),
  employmentType: z.enum(["PERMANENT", "CONTRACT", "PART_TIME", "VOLUNTEER"]), dateJoined: zs.optDate(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"]).default("ACTIVE"), registrationNo: zs.optStr(40), subjectIds: zs.ids(),
  // sensitive
  basicSalary: optNumber(),
  bankName: zs.optStr(80), bankAccount: zs.optStr(40), tinNumber: zs.optStr(30), nssfNumber: zs.optStr(30),
};
const SENSITIVE = ["basicSalary", "bankName", "bankAccount", "tinNumber", "nssfNumber"] as const;

export const saveStaff = action(
  { permission: "staff.manage", revalidate: "/staff", schema: z.object({ id: zs.optId(), ...fields }) },
  async ({ id, subjectIds, ...data }, user, fd) => {
    // Without hr.sensitive, sensitive fields are neither shown nor changed.
    if (!can(user, "hr.sensitive")) for (const k of SENSITIVE) delete (data as any)[k];
    const photo = fileFrom(fd, "photo");
    const photoFileId = photo ? (await saveUpload(photo, "STAFF_PHOTO", user.id, { imagesOnly: true })).id : undefined;
    const st = await prisma.$transaction(async (tx) => {
      const payload = { ...data, ...(photoFileId ? { photoFileId } : {}) };
      const st = id ? await tx.staff.update({ where: { id }, data: payload }) : await tx.staff.create({ data: payload });
      await tx.staffSubject.deleteMany({ where: { staffId: st.id } });
      if (subjectIds.length) await tx.staffSubject.createMany({ data: subjectIds.map((subjectId) => ({ staffId: st.id, subjectId })) });
      if (data.status === "EXITED" && st.userId) await tx.user.update({ where: { id: st.userId }, data: { isActive: false } });
      await audit(user.id, id ? "UPDATE" : "CREATE", "Staff", st.id, { staffNo: st.staffNo, sensitiveEdited: SENSITIVE.some((k) => k in data) }, tx);
      return st;
    });
    return { ok: true, message: "Staff record saved.", redirect: `/staff/${st.id}` };
  },
);

export const addQualification = action(
  { permission: "staff.manage", schema: z.object({ staffId: zs.id(), title: zs.str(150), institution: zs.optStr(150), year: zs.optInt() }) },
  async (d, user) => {
    await prisma.staffQualification.create({ data: { ...d, year: d.year ?? null } });
    await audit(user.id, "ADD_QUALIFICATION", "Staff", d.staffId, { title: d.title });
    return { ok: true, message: "Qualification added." };
  },
);

export const removeQualification = action(
  { permission: "staff.manage", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const q = await prisma.staffQualification.delete({ where: { id } });
    await audit(user.id, "REMOVE_QUALIFICATION", "Staff", q.staffId, { title: q.title });
    return { ok: true, message: "Qualification removed." };
  },
);

export const createStaffAccount = action(
  { permission: "users.manage", schema: z.object({ staffId: zs.id(), username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/), roleIds: zs.ids() }) },
  async ({ staffId, username, roleIds }, user) => {
    const st = await prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    if (st.userId) throw new UserError("This staff member already has an account.");
    if (!roleIds.length) throw new UserError("Choose at least one role.");
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.some((r) => r.code === "ADMIN") && !user.roles.includes("ADMIN")) throw new UserError("Only administrators can grant the administrator role.");
    const temp = generateTempPassword();
    const emailTaken = st.email ? await prisma.user.findUnique({ where: { email: st.email } }) : null;
    const u = await prisma.user.create({
      data: {
        username, fullName: `${st.firstName} ${st.lastName}`, email: emailTaken ? null : st.email, phone: st.phone,
        passwordHash: await hashPassword(temp), mustChangePassword: true, roles: { create: roleIds.map((roleId) => ({ roleId })) }, staff: { connect: { id: st.id } },
      },
    });
    await audit(user.id, "CREATE_ACCOUNT", "Staff", st.id, { userId: u.id, username });
    return { ok: true, message: `Account created. Username: ${username} · Temporary password: ${temp}` };
  },
);

export const deleteStaff = action(
  { permission: "staff.manage", revalidate: "/staff", schema: z.object({ id: zs.id(), fromProfile: zs.bool() }) },
  async ({ id, fromProfile }, user) => {
    const st = await deleteStaffRecord(id, user.id);
    const message = `${st.firstName} ${st.lastName} (${st.staffNo}) was deleted.`;
    return { ok: true, message, ...(fromProfile ? { serverRedirect: "/staff?deleted=1" } : {}) };
  },
);
