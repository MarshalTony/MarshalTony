"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { optNumber } from "../schemas";
import { can } from "../auth";
import { fileFrom, saveUpload } from "../storage";
import { generateTempPassword, hashPassword, passwordProblem } from "../passwords";
import { uniqueUsername, usernameBase } from "../users";
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

const USERNAME = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Username: 3–40 characters, letters, numbers, . _ -");

/**
 * Create a staff login. The administrator types the username and (optionally) the password; with no password a
 * temporary one is generated and shown once. "Must change at first sign-in" is ticked by default.
 */
export const createStaffAccount = action(
  {
    permission: "users.manage", revalidate: "/staff",
    schema: z.object({ staffId: zs.id(), username: USERNAME, roleIds: zs.ids(), password: z.string().max(128).optional(), mustChange: zs.bool() }),
  },
  async ({ staffId, username, roleIds, password, mustChange }, user) => {
    const st = await prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    if (st.userId) throw new UserError("This staff member already has a login.");
    if (!roleIds.length) throw new UserError("Choose at least one role.");
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.some((r) => r.code === "ADMIN") && !user.roles.includes("ADMIN")) throw new UserError("Only administrators can grant the administrator role.");
    if (await prisma.user.findUnique({ where: { username } })) throw new UserError(`The username "${username}" is already taken.`);
    const chosen = (password ?? "").trim();
    if (chosen) { const problem = passwordProblem(chosen); if (problem) throw new UserError(problem); }
    const pw = chosen || generateTempPassword();
    const emailTaken = st.email ? await prisma.user.findUnique({ where: { email: st.email } }) : null;
    const u = await prisma.user.create({
      data: {
        username, fullName: `${st.firstName} ${st.lastName}`, email: emailTaken ? null : st.email, phone: st.phone,
        passwordHash: await hashPassword(pw), mustChangePassword: chosen ? mustChange : true,
        roles: { create: roleIds.map((roleId) => ({ roleId })) }, staff: { connect: { id: st.id } },
      },
    });
    await audit(user.id, "CREATE_ACCOUNT", "Staff", st.id, { userId: u.id, username, roles: roles.map((r) => r.code), passwordSetByAdmin: !!chosen, mustChange: chosen ? mustChange : true });
    return { ok: true, message: chosen ? `Login created for ${st.firstName} ${st.lastName}: username ${username}.` : `Login created. Username: ${username} · Temporary password: ${pw}` };
  },
);

/** Logins for every active staff member who has none: usernames first.last, one starting password set by the administrator. */
export const bulkCreateStaffAccounts = action(
  {
    permission: "users.manage", revalidate: "/staff",
    schema: z.object({ password: z.string().max(128), roleId: zs.id(), scope: z.enum(["TEACHING", "ALL"]), mustChange: zs.bool() }),
  },
  async ({ password, roleId, scope, mustChange }, user) => {
    const problem = passwordProblem(password);
    if (problem) throw new UserError(problem);
    const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
    if (role.code === "ADMIN") throw new UserError("Give administrator rights one person at a time.");
    const list = await prisma.staff.findMany({ where: { userId: null, status: "ACTIVE", ...(scope === "TEACHING" ? { isTeaching: true } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
    if (!list.length) return { ok: true, message: "Everyone in this group already has a login." };
    const hash = await hashPassword(password);
    const created: string[] = [];
    await prisma.$transaction(async (tx) => {
      const taken = new Set<string>();
      for (const st of list) {
        const username = await uniqueUsername(usernameBase(st.firstName, st.lastName), tx, taken);
        taken.add(username);
        const emailTaken = st.email ? await tx.user.findUnique({ where: { email: st.email } }) : null;
        await tx.user.create({
          data: {
            username, fullName: `${st.firstName} ${st.lastName}`, email: emailTaken ? null : st.email, phone: st.phone,
            passwordHash: hash, mustChangePassword: mustChange, roles: { create: [{ roleId }] }, staff: { connect: { id: st.id } },
          },
        });
        created.push(username);
      }
      await audit(user.id, "BULK_CREATE_ACCOUNTS", "Staff", null, { count: created.length, role: role.code, scope, mustChange, usernames: created }, tx);
    }, { timeout: 120_000 });
    return { ok: true, message: `${created.length} login(s) created with the role ${role.name}. Usernames are first.last (see the list).` };
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
