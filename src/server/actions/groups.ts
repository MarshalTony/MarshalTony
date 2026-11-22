"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { allocateHouses } from "@/lib/houses";

const REVALIDATE = "/students/groups";

// ---------------------------------------------------------------- Houses
export const saveHouse = action(
  {
    permission: "students.manage", revalidate: REVALIDATE,
    schema: z.object({ id: zs.optId(), name: zs.str(60), colour: zs.optStr(30), patronId: zs.optId(), isActive: zs.bool() }),
  },
  async ({ id, ...data }, user) => {
    const clash = await prisma.house.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new UserError(`There is already a house called ${clash.name}.`);
    const h = id ? await prisma.house.update({ where: { id }, data }) : await prisma.house.create({ data: { ...data, isActive: true } });
    await audit(user.id, id ? "UPDATE" : "CREATE", "House", h.id, data);
    return { ok: true, message: `House ${h.name} saved.` };
  },
);

export const deleteHouse = action(
  { permission: "students.manage", revalidate: REVALIDATE, schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const h = await prisma.house.findUniqueOrThrow({ where: { id }, include: { _count: { select: { students: true } } } });
    await prisma.house.delete({ where: { id } }); // members are left without a house
    await audit(user.id, "DELETE", "House", id, { name: h.name, students: h._count.students });
    return { ok: true, message: `House ${h.name} deleted${h._count.students ? `; its ${h._count.students} student(s) now have no house` : ""}.`, redirect: "/students/groups" };
  },
);

/** Put the ticked students in a house (moves them from any other house). */
export const addToHouse = action(
  { permission: "students.manage", schema: z.object({ houseId: zs.id(), studentIds: zs.ids() }) },
  async ({ houseId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the students to put in this house.");
    const h = await prisma.house.findUniqueOrThrow({ where: { id: houseId } });
    const { count } = await prisma.student.updateMany({ where: { id: { in: studentIds } }, data: { houseId } });
    await audit(user.id, "HOUSE_ADD", "House", houseId, { count, studentIds: studentIds.slice(0, 200) });
    return { ok: true, message: `${count} student(s) put in ${h.name}.` };
  },
);

export const removeFromHouse = action(
  { permission: "students.manage", schema: z.object({ houseId: zs.id(), studentIds: zs.ids() }) },
  async ({ houseId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the students to remove.");
    const { count } = await prisma.student.updateMany({ where: { id: { in: studentIds }, houseId }, data: { houseId: null } });
    await audit(user.id, "HOUSE_REMOVE", "House", houseId, { count, studentIds: studentIds.slice(0, 200) });
    return { ok: true, message: `${count} student(s) removed from the house.` };
  },
);

/** Share every active student without a house among the active houses, balanced by class and sex. */
export const allocateStudentsToHouses = action(
  { permission: "students.manage", revalidate: REVALIDATE, schema: z.object({ classId: zs.optId() }) },
  async ({ classId }, user) => {
    const houses = await prisma.house.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    if (houses.length < 2) throw new UserError("Create at least two houses first.");
    const scope = { status: "ACTIVE" as const, ...(classId ? { classId } : {}) };
    const [without, placed] = await Promise.all([
      prisma.student.findMany({ where: { ...scope, houseId: null }, select: { id: true, classId: true, gender: true }, orderBy: [{ classId: "asc" }, { lastName: "asc" }, { firstName: "asc" }] }),
      prisma.student.findMany({ where: { status: "ACTIVE", houseId: { not: null } }, select: { houseId: true, classId: true, gender: true } }),
    ]);
    if (!without.length) return { ok: true, message: "Every student already has a house." };
    const plan = allocateHouses(without, houses.map((h) => h.id), placed.map((p) => ({ houseId: p.houseId!, classId: p.classId, gender: p.gender })));
    await prisma.$transaction(async (tx) => {
      for (const h of houses) {
        const ids = [...plan].filter(([, hid]) => hid === h.id).map(([sid]) => sid);
        if (ids.length) await tx.student.updateMany({ where: { id: { in: ids } }, data: { houseId: h.id } });
      }
      await audit(user.id, "HOUSE_ALLOCATE", "House", null, { students: plan.size, classId }, tx);
    }, { timeout: 60_000 });
    return { ok: true, message: `${plan.size} student(s) shared among ${houses.length} houses (balanced by class and sex).` };
  },
);

// ---------------------------------------------------------------- Clubs
export const saveClub = action(
  {
    permission: "students.manage", revalidate: REVALIDATE,
    schema: z.object({ id: zs.optId(), name: zs.str(80), description: zs.optStr(300), patronId: zs.optId(), isActive: zs.bool() }),
  },
  async ({ id, ...data }, user) => {
    const clash = await prisma.club.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new UserError(`There is already a club called ${clash.name}.`);
    const c = id ? await prisma.club.update({ where: { id }, data }) : await prisma.club.create({ data: { ...data, isActive: true } });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Club", c.id, data);
    return { ok: true, message: `Club ${c.name} saved.` };
  },
);

export const deleteClub = action(
  { permission: "students.manage", revalidate: REVALIDATE, schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const c = await prisma.club.findUniqueOrThrow({ where: { id }, include: { _count: { select: { members: true } } } });
    await prisma.club.delete({ where: { id } });
    await audit(user.id, "DELETE", "Club", id, { name: c.name, members: c._count.members });
    return { ok: true, message: `Club ${c.name} deleted${c._count.members ? ` with its ${c._count.members} member(s)` : ""}.`, redirect: "/students/groups?tab=clubs" };
  },
);

export const addClubMembers = action(
  { permission: "students.manage", schema: z.object({ clubId: zs.id(), studentIds: zs.ids() }) },
  async ({ clubId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the students to add.");
    const c = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
    const { count } = await prisma.clubMember.createMany({ data: studentIds.map((studentId) => ({ clubId, studentId })), skipDuplicates: true });
    await audit(user.id, "CLUB_ADD", "Club", clubId, { count, studentIds: studentIds.slice(0, 200) });
    return { ok: true, message: `${count} student(s) added to ${c.name}.` };
  },
);

export const removeClubMembers = action(
  { permission: "students.manage", schema: z.object({ clubId: zs.id(), studentIds: zs.ids() }) },
  async ({ clubId, studentIds }, user) => {
    if (!studentIds.length) throw new UserError("Tick the members to remove.");
    const { count } = await prisma.clubMember.deleteMany({ where: { clubId, studentId: { in: studentIds } } });
    await audit(user.id, "CLUB_REMOVE", "Club", clubId, { count, studentIds: studentIds.slice(0, 200) });
    return { ok: true, message: `${count} member(s) removed.` };
  },
);

export const setClubRole = action(
  { permission: "students.manage", schema: z.object({ clubId: zs.id(), studentId: zs.id(), role: zs.optStr(40) }) },
  async ({ clubId, studentId, role }, user) => {
    await prisma.clubMember.update({ where: { clubId_studentId: { clubId, studentId } }, data: { role } });
    await audit(user.id, "CLUB_ROLE", "Club", clubId, { studentId, role });
    return { ok: true, message: role ? `Role set: ${role}.` : "Role cleared." };
  },
);
