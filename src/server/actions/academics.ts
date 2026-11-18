"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { currentYearOrThrow } from "../students";

export const saveSubject = action(
  {
    permission: "academics.manage",
    revalidate: "/academics",
    schema: z.object({
      id: zs.optId(), code: z.string().trim().toUpperCase().min(1).max(12), name: zs.str(80), shortName: zs.optStr(20),
      level: z.enum(["O_LEVEL", "A_LEVEL"]), category: z.enum(["COMPULSORY", "ELECTIVE", "PRINCIPAL", "SUBSIDIARY"]),
      weight: z.coerce.number().min(0).max(10), hasPractical: zs.bool(), isActive: zs.bool(), departmentId: zs.optId(),
    }),
  },
  async ({ id, ...data }, user) => {
    if (data.level === "O_LEVEL" && ["PRINCIPAL", "SUBSIDIARY"].includes(data.category)) throw new UserError("O-Level subjects are compulsory or elective.");
    if (data.level === "A_LEVEL" && ["COMPULSORY", "ELECTIVE"].includes(data.category)) throw new UserError("A-Level subjects are principal or subsidiary.");
    const s = id ? await prisma.subject.update({ where: { id }, data }) : await prisma.subject.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "Subject", s.id, data);
    return { ok: true, message: "Subject saved." };
  },
);

export const saveCombination = action(
  {
    permission: "academics.manage",
    revalidate: "/academics",
    schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(2).max(10), name: zs.str(120), isActive: zs.bool(), subjectIds: zs.ids() }),
  },
  async ({ id, subjectIds, ...data }, user) => {
    const subs = await prisma.subject.findMany({ where: { id: { in: subjectIds } } });
    if (subs.some((s) => s.level !== "A_LEVEL")) throw new UserError("Combinations may only contain A-Level subjects.");
    if (subs.filter((s) => s.category === "PRINCIPAL").length < 2) throw new UserError("A combination needs at least two principal subjects.");
    await prisma.$transaction(async (tx) => {
      const c = id ? await tx.subjectCombination.update({ where: { id }, data }) : await tx.subjectCombination.create({ data });
      await tx.combinationSubject.deleteMany({ where: { combinationId: c.id } });
      await tx.combinationSubject.createMany({ data: subjectIds.map((subjectId) => ({ combinationId: c.id, subjectId })) });
      await audit(user.id, id ? "UPDATE" : "CREATE", "SubjectCombination", c.id, { ...data, subjectIds }, tx);
    });
    return { ok: true, message: "Combination saved." };
  },
);

export const addAllocation = action(
  { permission: "academics.manage", revalidate: "/academics/allocations", schema: z.object({ staffId: zs.id(), subjectId: zs.id(), streamIds: zs.ids() }) },
  async ({ staffId, subjectId, streamIds }, user) => {
    if (!streamIds.length) throw new UserError("Choose at least one stream.");
    const year = await currentYearOrThrow(prisma);
    const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
    const streams = await prisma.stream.findMany({ where: { id: { in: streamIds } }, include: { schoolClass: true } });
    const wrong = streams.filter((s) => s.schoolClass.level !== subject.level);
    if (wrong.length) throw new UserError(`${subject.name} (${subject.level === "O_LEVEL" ? "O" : "A"}-Level) cannot be taught in ${wrong.map((w) => w.schoolClass.code + " " + w.name).join(", ")}.`);
    for (const streamId of streamIds) {
      await prisma.teacherAllocation.upsert({
        where: { staffId_subjectId_streamId_academicYearId: { staffId, subjectId, streamId, academicYearId: year.id } },
        update: {}, create: { staffId, subjectId, streamId, academicYearId: year.id },
      });
    }
    await audit(user.id, "ALLOCATE", "TeacherAllocation", staffId, { subjectId, streamIds, year: year.name });
    return { ok: true, message: `Allocated to ${streamIds.length} stream(s).` };
  },
);

export const removeAllocation = action(
  { permission: "academics.manage", revalidate: "/academics/allocations", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const a = await prisma.teacherAllocation.delete({ where: { id } });
    await audit(user.id, "DEALLOCATE", "TeacherAllocation", id, a);
    return { ok: true, message: "Allocation removed." };
  },
);

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const saveTimetableSlot = action(
  {
    permission: "academics.manage",
    schema: z.object({
      id: zs.optId(), termId: zs.id(), streamId: zs.id(), dayOfWeek: z.coerce.number().int().min(1).max(6), startTime: TIME, endTime: TIME,
      subjectId: zs.optId(), staffId: zs.optId(), label: zs.optStr(40), room: zs.optStr(40),
    }),
  },
  async ({ id, ...data }, user) => {
    if (data.endTime <= data.startTime) throw new UserError("End time must be after start time.");
    if (!data.subjectId && !data.label) throw new UserError("Choose a subject or enter a label (e.g. Break).");
    // Teacher double-booking check
    if (data.staffId) {
      const clash = await prisma.timetableSlot.findFirst({
        where: { id: id ? { not: id } : undefined, termId: data.termId, staffId: data.staffId, dayOfWeek: data.dayOfWeek, startTime: { lt: data.endTime }, endTime: { gt: data.startTime } },
        include: { stream: { include: { schoolClass: true } } },
      });
      if (clash) throw new UserError(`The teacher already has a lesson in ${clash.stream.schoolClass.code} ${clash.stream.name} at ${clash.startTime}.`);
    }
    const overlap = await prisma.timetableSlot.findFirst({
      where: { id: id ? { not: id } : undefined, termId: data.termId, streamId: data.streamId, dayOfWeek: data.dayOfWeek, startTime: { lt: data.endTime }, endTime: { gt: data.startTime } },
    });
    if (overlap) throw new UserError(`This stream already has a period at ${overlap.startTime}–${overlap.endTime}.`);
    const slot = id ? await prisma.timetableSlot.update({ where: { id }, data }) : await prisma.timetableSlot.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "TimetableSlot", slot.id, data);
    return { ok: true, message: "Timetable updated." };
  },
);

export const deleteTimetableSlot = action(
  { permission: "academics.manage", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    await prisma.timetableSlot.delete({ where: { id } });
    await audit(user.id, "DELETE", "TimetableSlot", id);
    return { ok: true, message: "Period removed." };
  },
);

export const saveCalendarEvent = action(
  {
    permission: "announcements.manage",
    revalidate: "/announcements",
    schema: z.object({
      id: zs.optId(), title: zs.str(150), description: zs.optStr(1000), type: z.enum(["TERM", "EXAM", "HOLIDAY", "MEETING", "EVENT"]),
      startDate: zs.date(), endDate: zs.date(), audience: z.enum(["ALL", "STAFF", "PARENTS", "STUDENTS"]),
    }),
  },
  async ({ id, ...data }, user) => {
    if (data.endDate < data.startDate) throw new UserError("End date cannot be before the start date.");
    const e = id ? await prisma.calendarEvent.update({ where: { id }, data }) : await prisma.calendarEvent.create({ data });
    await audit(user.id, id ? "UPDATE" : "CREATE", "CalendarEvent", e.id, { title: data.title });
    return { ok: true, message: "Calendar event saved." };
  },
);

export const deleteCalendarEvent = action(
  { permission: "announcements.manage", revalidate: "/announcements", schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    await prisma.calendarEvent.delete({ where: { id } });
    await audit(user.id, "DELETE", "CalendarEvent", id);
    return { ok: true, message: "Event deleted." };
  },
);
