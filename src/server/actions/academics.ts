"use server";
import { z } from "zod";
import { optCombinationCategory } from "../schemas";
import { classSubjectStatus } from "../class-subjects";
import { effectiveStatus, subjectFixes, type SubjectStatus } from "@/lib/class-subjects";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { currentYearOrThrow } from "../students";
import { aLevelProblems } from "@/lib/alevel";
import { pickStream } from "@/lib/combination-stream";
import { moveToStream } from "../combination-stream";

export const saveSubject = action(
  {
    permission: "academics.manage",
    revalidate: "/academics",
    schema: z.object({
      id: zs.optId(), code: z.string().trim().toUpperCase().min(1).max(12), name: zs.str(80), shortName: zs.optStr(20),
      level: z.enum(["O_LEVEL", "A_LEVEL"]), category: z.enum(["COMPULSORY", "ELECTIVE", "PRINCIPAL", "SUBSIDIARY"]),
      weight: z.coerce.number().min(0).max(10), hasPractical: zs.bool(), isActive: zs.bool(), departmentId: zs.optId(),
      paperCount: z.coerce.number().int().min(1, "At least 1 paper").max(4, "At most 4 papers").default(1),
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
    schema: z.object({ id: zs.optId(), code: z.string().trim().toUpperCase().min(2).max(10), name: zs.str(120), category: optCombinationCategory(), isActive: zs.bool(), subjectIds: zs.ids() }),
  },
  async ({ id, subjectIds, ...data }, user) => {
    const subs = await prisma.subject.findMany({ where: { id: { in: subjectIds } } });
    if (subs.some((s) => s.level !== "A_LEVEL")) throw new UserError("Combinations may only contain A-Level subjects.");
    // School rule: 3 principal subjects + General Paper + either Sub-Maths or Sub-ICT.
    const problems = aLevelProblems(subs, { complete: true });
    if (problems.length) throw new UserError(`A combination needs 3 principal subjects, General Paper and either Sub-Maths or Sub-ICT: ${problems.join("; ")}.`);
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

const gridPayload = z.object({
  cells: z.array(z.object({ subjectId: zs.id(), streamId: zs.id(), staffId: z.string().max(40) })).max(2000),
  classTeachers: z.array(z.object({ streamId: zs.id(), staffId: z.string().max(40) })).max(50),
});

/**
 * Allocation grid (one class, one year): each changed cell sets exactly one teacher for that subject × stream
 * (replacing whoever was there; empty = nobody). Class teachers per stream are saved too. Only changed cells are sent.
 */
export const saveAllocationGrid = action(
  { permission: "academics.manage", revalidate: "/academics", schema: z.object({ classId: zs.id(), academicYearId: zs.id(), payload: z.string().max(500_000) }) },
  async ({ classId, academicYearId, payload }, user) => {
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { throw new UserError("Could not read the changes. Reload the page and try again."); }
    const { cells, classTeachers } = gridPayload.parse(parsed);
    if (!cells.length && !classTeachers.length) return { ok: true, message: "No changes to save." };
    const result = await prisma.$transaction(async (tx) => {
      const cls = await tx.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { streams: true } });
      await tx.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });
      const streamIds = new Set(cls.streams.map((s) => s.id));
      const subjectIds = new Set((await tx.subject.findMany({ where: { level: cls.level }, select: { id: true } })).map((s) => s.id));
      const staffIds = new Set([...cells, ...classTeachers].map((c) => c.staffId).filter(Boolean));
      const okStaff = new Set((await tx.staff.findMany({ where: { id: { in: [...staffIds] } }, select: { id: true } })).map((s) => s.id));
      let added = 0, removed = 0;
      for (const c of cells) {
        if (!streamIds.has(c.streamId) || !subjectIds.has(c.subjectId)) throw new UserError("A subject or stream does not belong to this class. Reload the page.");
        if (c.staffId && !okStaff.has(c.staffId)) throw new UserError("Unknown teacher. Reload the page.");
        const del = await tx.teacherAllocation.deleteMany({ where: { subjectId: c.subjectId, streamId: c.streamId, academicYearId, ...(c.staffId ? { staffId: { not: c.staffId } } : {}) } });
        removed += del.count;
        if (c.staffId) {
          const exists = await tx.teacherAllocation.findUnique({ where: { staffId_subjectId_streamId_academicYearId: { staffId: c.staffId, subjectId: c.subjectId, streamId: c.streamId, academicYearId } } });
          if (!exists) { await tx.teacherAllocation.create({ data: { staffId: c.staffId, subjectId: c.subjectId, streamId: c.streamId, academicYearId } }); added++; }
        }
      }
      for (const ct of classTeachers) {
        if (!streamIds.has(ct.streamId)) throw new UserError("A stream does not belong to this class. Reload the page.");
        if (ct.staffId && !okStaff.has(ct.staffId)) throw new UserError("Unknown teacher. Reload the page.");
        await tx.stream.update({ where: { id: ct.streamId }, data: { classTeacherId: ct.staffId || null } });
      }
      await audit(user.id, "ALLOCATION_GRID", "SchoolClass", classId, { academicYearId, cells, classTeachers, added, removed }, tx);
      return { added, removed };
    }, { timeout: 60_000 });
    const parts = [result.added && `${result.added} allocation(s) added`, result.removed && `${result.removed} removed`, classTeachers.length && `${classTeachers.length} class teacher(s) set`].filter(Boolean);
    return { ok: true, message: parts.length ? `Saved: ${parts.join(", ")}.` : "Saved." };
  },
);

/** Copies one class's allocations from another year into empty cells of the same streams (staff who have left are skipped). */
export const copyAllocations = action(
  { permission: "academics.manage", revalidate: "/academics", schema: z.object({ classId: zs.id(), fromYearId: zs.id(), toYearId: zs.id() }) },
  async ({ classId, fromYearId, toYearId }, user) => {
    if (fromYearId === toYearId) throw new UserError("Choose a different year to copy from.");
    const cls = await prisma.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { streams: true } });
    const ids = cls.streams.map((s) => s.id);
    const [from, existing] = await Promise.all([
      prisma.teacherAllocation.findMany({ where: { academicYearId: fromYearId, streamId: { in: ids }, staff: { status: "ACTIVE" } } }),
      prisma.teacherAllocation.findMany({ where: { academicYearId: toYearId, streamId: { in: ids } } }),
    ]);
    const taken = new Set(existing.map((a) => `${a.subjectId}:${a.streamId}`));
    const data = from.filter((a) => !taken.has(`${a.subjectId}:${a.streamId}`)).map((a) => ({ staffId: a.staffId, subjectId: a.subjectId, streamId: a.streamId, academicYearId: toYearId }));
    if (data.length) await prisma.teacherAllocation.createMany({ data, skipDuplicates: true });
    await audit(user.id, "ALLOCATIONS_COPIED", "SchoolClass", classId, { fromYearId, toYearId, count: data.length });
    return { ok: true, message: data.length ? `Copied ${data.length} allocation(s) into empty cells.` : "Nothing to copy — every cell already has a teacher, or last year has no allocations for this class." };
  },
);

/** Report-card subject order for one level: `ids` in the order they should print (positions 1, 2, 3 …). */
export const saveSubjectOrder = action(
  { permission: "academics.manage", revalidate: "/academics", schema: z.object({ level: z.enum(["O_LEVEL", "A_LEVEL"]), ids: z.string().max(20_000) }) },
  async ({ level, ids }, user) => {
    let list: string[];
    try { list = z.array(zs.id()).max(200).parse(JSON.parse(ids)); } catch { throw new UserError("Could not read the order. Reload the page and try again."); }
    const subjects = await prisma.subject.findMany({ where: { level }, select: { id: true } });
    const known = new Set(subjects.map((s) => s.id));
    if (list.some((id) => !known.has(id))) throw new UserError("A subject does not belong to this level. Reload the page.");
    await prisma.$transaction(list.map((id, i) => prisma.subject.update({ where: { id }, data: { reportOrder: i + 1 } })));
    await audit(user.id, "SUBJECT_ORDER", "Subject", null, { level, order: list });
    return { ok: true, message: `Report-card order saved for ${level === "O_LEVEL" ? "O-Level" : "A-Level"} (${list.length} subjects).` };
  },
);

// ---------------- Subjects by class (O-Level) ----------------
/** Save how each O-Level subject is taken in each class: posted as `r_<classId>_<subjectId>` = COMPULSORY | OPTIONAL | NOT_OFFERED. */
export const saveClassSubjects = action(
  { permission: "academics.manage", revalidate: "/academics/classes", schema: z.object({}) },
  async (_d, user, fd) => {
    const [classes, subjects] = await Promise.all([
      prisma.schoolClass.findMany({ where: { level: "O_LEVEL" }, select: { id: true } }),
      prisma.subject.findMany({ where: { level: "O_LEVEL" }, select: { id: true, category: true } }),
    ]);
    const categoryOf = new Map(subjects.map((x) => [x.id, x.category]));
    const okClass = new Set(classes.map((c) => c.id)), okSubject = new Set(subjects.map((x) => x.id));
    const rows: { classId: string; subjectId: string; status: "COMPULSORY" | "OPTIONAL" | "NOT_OFFERED" }[] = [];
    for (const [k, v] of fd.entries()) {
      const m = /^r_([^_]+)_([^_]+)$/.exec(k);
      if (!m || typeof v !== "string") continue;
      if (!okClass.has(m[1]) || !okSubject.has(m[2])) throw new UserError("Unknown class or subject. Reload the page.");
      if (v !== "COMPULSORY" && v !== "OPTIONAL" && v !== "NOT_OFFERED") throw new UserError("Choose Compulsory, Optional or Not offered.");
      rows.push({ classId: m[1], subjectId: m[2], status: v });
    }
    if (!rows.length) return { ok: true, message: "Nothing to save." };
    const stored = new Map((await prisma.classSubject.findMany()).map((r) => [`${r.classId}:${r.subjectId}`, r.status as SubjectStatus]));
    // Compare with what applied before (the stored setting, or the subject's own category): only real changes are written and counted.
    const changed = rows.filter((r) => effectiveStatus(categoryOf.get(r.subjectId) ?? "ELECTIVE", stored.get(`${r.classId}:${r.subjectId}`)) !== r.status);
    await prisma.$transaction(async (tx) => {
      for (const r of changed) {
        await tx.classSubject.upsert({ where: { classId_subjectId: { classId: r.classId, subjectId: r.subjectId } }, update: { status: r.status }, create: r });
      }
      await audit(user.id, "SET_CLASS_SUBJECTS", "ClassSubject", null, { changed: changed.length, rows: changed.slice(0, 100) }, tx);
    });
    return { ok: true, message: changed.length ? `${changed.length} setting(s) saved. Use “Update students' subjects” to apply them to students already registered.` : "No changes to save." };
  },
);

/**
 * Bring students' subjects for the current year in line with Subjects by class: add the compulsory subjects they lack,
 * remove subjects not offered in their class (kept when the student already has marks in them). Optional subjects are untouched.
 */
export const applyClassSubjectRules = action(
  { permission: "academics.manage", revalidate: "/academics/classes", schema: z.object({ classId: zs.optId() }) },
  async ({ classId }, user) => {
    const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
    if (!year) throw new UserError("Set the current academic year first.");
    const classes = await prisma.schoolClass.findMany({ where: { level: "O_LEVEL", ...(classId ? { id: classId } : {}) }, select: { id: true } });
    let added = 0, removed = 0, kept = 0, students = 0;
    await prisma.$transaction(async (tx) => {
      for (const c of classes) {
        const { status } = await classSubjectStatus(tx, c.id);
        const list = await tx.student.findMany({
          where: { classId: c.id, status: "ACTIVE" },
          select: { id: true, subjects: { where: { academicYearId: year.id }, select: { subjectId: true } }, marks: { where: { exam: { term: { academicYearId: year.id } } }, select: { subjectId: true } } },
        });
        for (const s of list) {
          const f = subjectFixes(s.subjects.map((x) => x.subjectId), status, new Set(s.marks.map((m) => m.subjectId)));
          if (!f.add.length && !f.remove.length) { kept += f.keptWithMarks.length; continue; }
          if (f.add.length) await tx.studentSubject.createMany({ data: f.add.map((subjectId) => ({ studentId: s.id, subjectId, academicYearId: year.id })), skipDuplicates: true });
          if (f.remove.length) await tx.studentSubject.deleteMany({ where: { studentId: s.id, academicYearId: year.id, subjectId: { in: f.remove } } });
          added += f.add.length; removed += f.remove.length; kept += f.keptWithMarks.length; students++;
        }
      }
      await audit(user.id, "APPLY_CLASS_SUBJECTS", "ClassSubject", classId ?? null, { year: year.name, students, added, removed, keptWithMarks: kept }, tx);
    }, { timeout: 120_000 });
    if (!students) return { ok: true, message: `Every O-Level student's ${year.name} subjects already follow the class settings.${kept ? ` (${kept} not-offered subject(s) kept because they have marks.)` : ""}` };
    return { ok: true, message: `${students} student(s) updated: ${added} compulsory subject(s) added, ${removed} not-offered subject(s) removed.${kept ? ` ${kept} kept because they already have marks.` : ""} Optional subjects were not changed.` };
  },
);

/** S5–S6: move every active student to the stream that holds their combination's category (Arts / Sciences). */
export const placeStudentsByCombination = action(
  { permission: "academics.manage", revalidate: "/academics", schema: z.object({}) },
  async (_d, user) => {
    const year = await currentYearOrThrow(prisma);
    const students = await prisma.student.findMany({
      where: { status: "ACTIVE", schoolClass: { level: "A_LEVEL" }, combination: { category: { not: null } } },
      select: { id: true, classId: true, streamId: true, combination: { select: { category: true } }, schoolClass: { select: { streams: { select: { id: true, name: true, isActive: true, combinationCategory: true } } } } },
    });
    let moved = 0, noStream = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of students) {
        const to = pickStream(s.schoolClass.streams, s.combination?.category, s.streamId);
        if (!to) { noStream++; continue; }
        if (await moveToStream(tx, { studentId: s.id, fromStreamId: s.streamId, toStreamId: to, classId: s.classId, academicYearId: year.id, userId: user.id, reason: "combination category" })) moved++;
      }
      await audit(user.id, "PLACE_BY_COMBINATION", "Student", null, { moved, noStream }, tx);
    }, { timeout: 120_000 });
    return { ok: true, message: `${moved} student(s) moved to the stream of their combination's category.${noStream ? ` ${noStream} not moved: no stream in their class holds their category (set it in Settings → Classes & streams).` : ""}` };
  },
);
