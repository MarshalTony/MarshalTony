"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { fileFrom, saveUpload } from "../storage";
import { generateTempPassword, hashPassword, passwordProblem } from "../passwords";
import { bandsField, divisionsField } from "../schemas";

// ---------------- School profile ----------------
export const saveSchoolProfile = action(
  {
    permission: "settings.manage",
    revalidate: "/",
    schema: z.object({
      name: zs.str(150), motto: zs.optStr(200), address: zs.optStr(300), poBox: zs.optStr(100), website: zs.optStr(150),
      email: zs.email(), altEmail: zs.email(), phone: zs.optStr(40), altPhone: zs.optStr(40), centreNumberUce: zs.optStr(20), centreNumberUace: zs.optStr(20),
      headteacherName: zs.optStr(120), reportFooter: zs.optStr(300),
    }),
  },
  async (input, user, fd) => {
    const logo = fileFrom(fd, "logo");
    let logoFileId: string | undefined;
    if (logo) logoFileId = (await saveUpload(logo, "PUBLIC", user.id, { imagesOnly: true })).id;
    await prisma.schoolSetting.update({ where: { id: 1 }, data: { ...input, ...(logoFileId ? { logoFileId } : {}) } });
    await audit(user.id, "UPDATE", "SchoolSetting", "1", { fields: Object.keys(input), logoChanged: !!logoFileId });
    return { ok: true, message: "School profile saved." };
  },
);

export const saveReportTemplate = action(
  {
    permission: "settings.manage",
    schema: z.object({
      showPhoto: zs.bool(), showSubjectPositions: zs.bool(), showStreamPosition: zs.bool(), showClassPosition: zs.bool(),
      showAttendance: zs.bool(), showGradingKey: zs.bool(), cbcOLevel: zs.bool(), requireMarksApproval: zs.bool(), classTeacherLabel: zs.str(60), dosLabel: zs.str(60), headLabel: zs.str(60),
    }),
  },
  async (input, user) => {
    await prisma.schoolSetting.update({ where: { id: 1 }, data: { reportTemplate: input } });
    await audit(user.id, "UPDATE", "ReportTemplate", "1", input);
    return { ok: true, message: "Report card template saved." };
  },
);

export const saveNotificationPrefs = action(
  { permission: "settings.manage", schema: z.object({ smsOnPayment: zs.bool(), smsOnAbsence: zs.bool() }) },
  async (input, user) => {
    await prisma.schoolSetting.update({ where: { id: 1 }, data: { notificationPrefs: input } });
    await audit(user.id, "UPDATE", "NotificationPrefs", "1", input);
    return { ok: true, message: "Notification settings saved." };
  },
);

// ---------------- Academic years & terms ----------------
export const saveAcademicYear = action(
  { permission: "settings.manage", revalidate: "/settings/academic", schema: z.object({ id: zs.optId(), name: zs.str(20), startDate: zs.date(), endDate: zs.date() }) },
  async ({ id, ...data }, user) => {
    if (data.endDate <= data.startDate) throw new UserError("End date must be after start date.");
    const y = id ? await prisma.academicYear.update({ where: { id }, data }) : await prisma.academicYear.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "AcademicYear", y.id, data);
    return { ok: true, message: "Academic year saved." };
  },
);

export const saveTerm = action(
  {
    permission: "settings.manage",
    revalidate: "/settings/academic",
    schema: z.object({
      id: zs.optId(), academicYearId: zs.id(), number: z.coerce.number().int().min(1).max(3), name: zs.str(40),
      startDate: zs.date(), endDate: zs.date(), nextTermStart: zs.optDate(),
    }),
  },
  async ({ id, ...data }, user) => {
    if (data.endDate <= data.startDate) throw new UserError("Closing date must be after opening date.");
    const t = id ? await prisma.term.update({ where: { id }, data }) : await prisma.term.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Term", t.id, data);
    return { ok: true, message: "Term saved." };
  },
);

export const setCurrentTerm = action(
  { permission: "settings.manage", revalidate: "/", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const term = await prisma.term.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction([
      prisma.term.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
      prisma.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
      prisma.term.update({ where: { id }, data: { isCurrent: true } }),
      prisma.academicYear.update({ where: { id: term.academicYearId }, data: { isCurrent: true } }),
    ]);
    await audit(user.id, "SET_CURRENT", "Term", id);
    return { ok: true, message: `${term.name} is now the current term.` };
  },
);

// ---------------- Classes & streams ----------------
export const saveClass = action(
  {
    permission: "settings.manage",
    revalidate: "/settings/classes",
    schema: z.object({ id: zs.optId(), code: zs.str(10), name: zs.str(40), level: z.enum(["O_LEVEL", "A_LEVEL"]), order: zs.int(), isActive: zs.bool() }),
  },
  async ({ id, ...data }, user) => {
    const c = id ? await prisma.schoolClass.update({ where: { id }, data }) : await prisma.schoolClass.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "SchoolClass", c.id, data);
    return { ok: true, message: "Class saved." };
  },
);

export const saveStream = action(
  {
    permission: "settings.manage",
    revalidate: "/settings/classes",
    schema: z.object({ id: zs.optId(), classId: zs.id(), name: zs.str(30), capacity: zs.optInt(), classTeacherId: zs.optId(), isActive: zs.bool() }),
  },
  async ({ id, ...data }, user) => {
    const s = id ? await prisma.stream.update({ where: { id }, data }) : await prisma.stream.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Stream", s.id, data);
    return { ok: true, message: "Stream saved." };
  },
);

// ---------------- Users ----------------
const roleIds = z.array(z.string()).default([]);

export const createUser = action(
  {
    permission: "users.manage",
    revalidate: "/settings/users",
    schema: z.object({
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "3–40 characters: letters, numbers, . _ -"),
      fullName: zs.str(120), email: zs.email(), phone: zs.optStr(30), roleIds, password: z.string().max(128).optional(), mustChange: zs.bool(),
    }),
  },
  async ({ roleIds, password, mustChange, ...data }, user) => {
    if (roleIds.length === 0) throw new UserError("Choose at least one role.");
    await assertCanGrant(user.roles, roleIds);
    if (await prisma.user.findUnique({ where: { username: data.username } })) throw new UserError(`The username "${data.username}" is already taken.`);
    const chosen = (password ?? "").trim();
    if (chosen) { const problem = passwordProblem(chosen); if (problem) throw new UserError(problem); }
    const pw = chosen || generateTempPassword();
    const u = await prisma.user.create({
      data: { ...data, passwordHash: await hashPassword(pw), mustChangePassword: chosen ? mustChange : true, roles: { create: roleIds.map((roleId) => ({ roleId })) } },
    });
    await audit(user.id, "CREATE", "User", u.id, { username: u.username, roleIds, passwordSetByAdmin: !!chosen });
    return chosen
      ? { ok: true, message: `User ${u.username} created with the password you typed.` }
      : { ok: true, message: `User created. Temporary password: ${pw}`, data: { tempPassword: pw } };
  },
);

/** Only administrators may grant the ADMIN role. */
async function assertCanGrant(actorRoles: string[], roleIds: string[]) {
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
  if (roles.some((r) => r.code === "ADMIN") && !actorRoles.includes("ADMIN")) throw new UserError("Only a System Administrator can grant the administrator role.");
}

export const updateUserRoles = action(
  { permission: "users.manage", revalidate: "/settings/users", schema: z.object({ userId: zs.id(), roleIds, fullName: zs.str(120), email: zs.email(), phone: zs.optStr(30) }) },
  async ({ userId, roleIds, ...data }, user) => {
    if (roleIds.length === 0) throw new UserError("Choose at least one role.");
    await assertCanGrant(user.roles, roleIds);
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (target.roles.some((r) => r.role.code === "ADMIN") && !user.roles.includes("ADMIN")) throw new UserError("Only a System Administrator can edit an administrator.");
    if (userId === user.id && user.roles.includes("ADMIN")) {
      const adminRole = await prisma.role.findUnique({ where: { code: "ADMIN" } });
      if (adminRole && !roleIds.includes(adminRole.id)) throw new UserError("You cannot remove your own administrator role.");
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data }),
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) }),
    ]);
    await audit(user.id, "UPDATE_ROLES", "User", userId, { before: target.roles.map((r) => r.role.code), roleIds });
    return { ok: true, message: "User updated." };
  },
);

export const setUserActive = action(
  { permission: "users.manage", revalidate: "/settings/users", schema: z.object({ userId: zs.id(), active: zs.bool() }) },
  async ({ userId, active }, user) => {
    if (userId === user.id) throw new UserError("You cannot deactivate your own account.");
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isActive: active } }),
      ...(active ? [] : [prisma.session.deleteMany({ where: { userId } })]),
    ]);
    await audit(user.id, active ? "ACTIVATE" : "DEACTIVATE", "User", userId);
    return { ok: true, message: active ? "Account activated." : "Account deactivated and signed out." };
  },
);

export const adminResetPassword = action(
  { permission: "users.manage", revalidate: "/settings/users", schema: z.object({ userId: zs.id(), password: z.string().max(128).optional(), mustChange: zs.bool() }) },
  async ({ userId, password, mustChange }, user) => {
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (target.roles.some((r) => r.role.code === "ADMIN") && !user.roles.includes("ADMIN")) throw new UserError("Only a System Administrator can reset an administrator's password.");
    // The administrator may type the new password; otherwise a temporary one is generated and shown once.
    const chosen = (password ?? "").trim();
    if (chosen) { const problem = passwordProblem(chosen); if (problem) throw new UserError(problem); }
    const pw = chosen || generateTempPassword();
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw), mustChangePassword: chosen ? mustChange : true } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
    await audit(user.id, "RESET_PASSWORD", "User", userId, { setByAdmin: !!chosen, mustChange: chosen ? mustChange : true });
    return chosen
      ? { ok: true, message: `New password set for ${target.username}.${mustChange ? " They must change it when they next sign in." : ""}` }
      : { ok: true, message: `Password reset. Temporary password for ${target.username}: ${pw}`, data: { tempPassword: pw } };
  },
);

// ---------------- Roles & permissions ----------------
export const saveRole = action(
  {
    permission: "roles.manage",
    revalidate: "/settings/roles",
    schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, "Use capitals, digits and _").optional(), name: zs.str(60), description: zs.optStr(200), permissions: z.array(z.string()).default([]) }),
  },
  async ({ id, code, name, description, permissions }, user) => {
    const perms = await prisma.permission.findMany({ where: { code: { in: permissions } } });
    if (id) {
      const role = await prisma.role.findUniqueOrThrow({ where: { id } });
      if (role.code === "ADMIN") throw new UserError("The System Administrator role always has every permission and cannot be edited.");
      await prisma.$transaction([
        prisma.role.update({ where: { id }, data: { name, description } }),
        prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) }),
      ]);
      await audit(user.id, "UPDATE", "Role", id, { permissions });
    } else {
      if (!code) throw new UserError("Role code is required.");
      const r = await prisma.role.create({ data: { code, name, description, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
      await audit(user.id, "CREATE", "Role", r.id, { code, permissions });
    }
    return { ok: true, message: "Role saved." };
  },
);

// ---------------- Grading & result rules ----------------
export const saveGradingScale = action(
  {
    permission: "exams.manage",
    revalidate: "/settings/grading",
    schema: z.object({
      id: zs.optId(), name: zs.str(80), level: z.enum(["O_LEVEL", "A_LEVEL"]), appliesTo: z.enum(["ALL", "PRINCIPAL", "SUBSIDIARY", "ACTIVITY"]), isDefault: zs.bool(),
      bands: bandsField,
    }),
  },
  async ({ id, bands, ...data }, user) => {
    const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
    if (data.appliesTo !== "ACTIVITY" && sorted[0].minScore !== 0) throw new UserError("The lowest band must start at 0.");
    if (data.appliesTo === "ACTIVITY" && sorted[sorted.length - 1].maxScore > 3) throw new UserError("Activity scores are out of 3.");
    for (let i = 1; i < sorted.length; i++) if (sorted[i].minScore <= sorted[i - 1].minScore) throw new UserError("Bands must have different minimum scores.");
    await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.gradingScale.updateMany({ where: { level: data.level, appliesTo: data.appliesTo }, data: { isDefault: false } });
      const scale = id ? await tx.gradingScale.update({ where: { id }, data }) : await tx.gradingScale.create({ data });
      await tx.gradeBand.deleteMany({ where: { scaleId: scale.id } });
      await tx.gradeBand.createMany({ data: bands.map((b) => ({ ...b, scaleId: scale.id })) });
    });
    await audit(user.id, id ? "UPDATE" : "CREATE", "GradingScale", id ?? null, { ...data, bands });
    return { ok: true, message: "Grading scale saved. Regenerate exam results to apply it." };
  },
);

export const saveResultRule = action(
  {
    permission: "exams.manage",
    revalidate: "/settings/grading",
    schema: z.object({
      level: z.enum(["O_LEVEL", "A_LEVEL"]), rankingBasis: z.enum(["AVERAGE", "TOTAL", "POINTS", "AGGREGATE"]), bestOfSubjects: zs.optInt(),
      tieMethod: z.enum(["COMPETITION", "DENSE"]), absentPolicy: z.enum(["ZERO", "EXCLUDE"]), minSubjectsToRank: z.coerce.number().int().min(1).max(30),
      topClassCount: z.coerce.number().int().min(1).max(100), topStreamCount: z.coerce.number().int().min(1).max(50),
      divisions: divisionsField,
    }),
  },
  async ({ level, ...data }, user) => {
    if (data.rankingBasis === "AGGREGATE" && !data.bestOfSubjects) throw new UserError("Aggregate ranking needs the number of best subjects.");
    await prisma.resultRule.upsert({ where: { level }, update: { ...data, bestOfSubjects: data.bestOfSubjects ?? null }, create: { level, ...data, bestOfSubjects: data.bestOfSubjects ?? null } });
    await audit(user.id, "UPDATE", "ResultRule", level, data);
    return { ok: true, message: "Ranking rules saved. Regenerate exam results to apply them." };
  },
);

// ---------------- Simple lists ----------------
export const saveExamType = action(
  { permission: "exams.manage", revalidate: "/settings/lists", schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(2).max(10), name: zs.str(60), order: zs.int(), isActive: zs.bool() }) },
  async ({ id, ...data }, user) => {
    const t = id ? await prisma.examType.update({ where: { id }, data }) : await prisma.examType.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "ExamType", t.id, data);
    return { ok: true, message: "Exam type saved." };
  },
);

export const savePaymentMethod = action(
  { permission: "settings.manage", revalidate: "/settings/lists", schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(2).max(20), name: zs.str(60), isActive: zs.bool() }) },
  async ({ id, ...data }, user) => {
    const m = id ? await prisma.paymentMethod.update({ where: { id }, data }) : await prisma.paymentMethod.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "PaymentMethod", m.id, data);
    return { ok: true, message: "Payment method saved." };
  },
);

export const saveDepartment = action(
  { permission: "settings.manage", revalidate: "/settings/lists", schema: z.object({ id: zs.optId(), name: zs.str(60) }) },
  async ({ id, name }, user) => {
    const d = id ? await prisma.department.update({ where: { id }, data: { name } }) : await prisma.department.create({ data: { name } });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Department", d.id, { name });
    return { ok: true, message: "Department saved." };
  },
);

export const saveMessageTemplate = action(
  { permission: "settings.manage", revalidate: "/settings/lists", schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(2).max(40), name: zs.str(80), channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]), subject: zs.optStr(150), body: zs.str(2000) }) },
  async ({ id, ...data }, user) => {
    const t = id ? await prisma.messageTemplate.update({ where: { id }, data }) : await prisma.messageTemplate.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "MessageTemplate", t.id, { code: data.code });
    return { ok: true, message: "Template saved." };
  },
);
