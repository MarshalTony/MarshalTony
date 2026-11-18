"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { can, type CurrentUser } from "../auth";
import { validActivityScore } from "@/lib/cbc";

/** Subject teachers may only work on subjects they are allocated to (in the stream, or in any stream of the class). */
async function assertMayEnter(user: CurrentUser, termId: string, subjectId: string, where: { streamId?: string; classId?: string }) {
  const term = await prisma.term.findUniqueOrThrow({ where: { id: termId } });
  const elevated = can(user, "marks.enter.any", "marks.approve");
  if (!term.isCurrent && !elevated) throw new UserError("This term is closed. Ask the Director of Studies to make changes.");
  if (elevated) return term;
  if (!can(user, "marks.enter") || !user.staffId) throw new UserError("You are not allowed to enter assessment scores.");
  const alloc = await prisma.teacherAllocation.findFirst({
    where: { staffId: user.staffId, subjectId, academicYearId: term.academicYearId, ...(where.streamId ? { streamId: where.streamId } : { stream: { classId: where.classId } }) },
  });
  if (!alloc) throw new UserError("You are not allocated to teach this subject in this class.");
  return term;
}

export const addActivity = action(
  { permission: ["marks.enter", "marks.enter.any"], schema: z.object({ termId: zs.id(), classId: zs.id(), subjectId: zs.id(), title: zs.str(120) }) },
  async ({ termId, classId, subjectId, title }, user) => {
    await assertMayEnter(user, termId, subjectId, { classId });
    const cls = await prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
    if (cls.level !== "O_LEVEL") throw new UserError("Activities of Integration are recorded for O-Level classes.");
    const last = await prisma.learningActivity.aggregate({ where: { termId, classId, subjectId }, _max: { order: true } });
    const a = await prisma.learningActivity.create({ data: { termId, classId, subjectId, title, order: (last._max.order ?? 0) + 1, createdById: user.id } });
    await audit(user.id, "ADD_ACTIVITY", "LearningActivity", a.id, { title, classId, subjectId, termId });
    return { ok: true, message: `Chapter "${title}" added for the whole class.` };
  },
);

export const renameActivity = action(
  { permission: ["marks.enter", "marks.enter.any"], schema: z.object({ id: zs.id(), title: zs.str(120) }) },
  async ({ id, title }, user) => {
    const a = await prisma.learningActivity.findUniqueOrThrow({ where: { id } });
    await assertMayEnter(user, a.termId, a.subjectId, { classId: a.classId });
    await prisma.learningActivity.update({ where: { id }, data: { title } });
    await audit(user.id, "RENAME_ACTIVITY", "LearningActivity", id, { from: a.title, to: title });
    return { ok: true, message: "Chapter renamed." };
  },
);

export const deleteActivity = action(
  { permission: ["marks.enter", "marks.enter.any"], schema: z.object({ id: zs.id() }) },
  async ({ id }, user) => {
    const a = await prisma.learningActivity.findUniqueOrThrow({ where: { id }, include: { _count: { select: { scores: true } } } });
    await assertMayEnter(user, a.termId, a.subjectId, { classId: a.classId });
    if (a._count.scores > 0 && !can(user, "marks.enter.any", "marks.approve"))
      throw new UserError(`"${a.title}" already has ${a._count.scores} score(s). Clear them first, or ask the Director of Studies to remove it.`);
    await prisma.learningActivity.delete({ where: { id } });
    await audit(user.id, "DELETE_ACTIVITY", "LearningActivity", id, { title: a.title, scores: a._count.scores });
    return { ok: true, message: `Chapter "${a.title}" removed.` };
  },
);

/** Grid posts `s_<activityId>_<studentId>` (score 0–3 or empty) and `r_<studentId>` (remark). */
export const saveActivityScores = action(
  { permission: ["marks.enter", "marks.enter.any"], schema: z.object({ termId: zs.id(), streamId: zs.id(), subjectId: zs.id() }) },
  async ({ termId, streamId, subjectId }, user, fd) => {
    const term = await assertMayEnter(user, termId, subjectId, { streamId });
    const stream = await prisma.stream.findUniqueOrThrow({ where: { id: streamId } });
    const activities = await prisma.learningActivity.findMany({ where: { termId, classId: stream.classId, subjectId } });
    const actIds = new Set(activities.map((a) => a.id));
    const students = await prisma.student.findMany({
      where: { streamId, status: "ACTIVE", subjects: { some: { subjectId, academicYearId: term.academicYearId } } }, select: { id: true },
    });
    const ids = new Set(students.map((s) => s.id));

    const bad: string[] = [];
    const upserts: { activityId: string; studentId: string; score: number }[] = [];
    const clears: { activityId: string; studentId: string }[] = [];
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" || !k.startsWith("s_")) continue;
      const [, activityId, studentId] = k.split("_");
      if (!actIds.has(activityId) || !ids.has(studentId)) continue;
      const parsed = validActivityScore(v);
      if (parsed === "invalid") bad.push(v);
      else if (parsed === null) clears.push({ activityId, studentId });
      else upserts.push({ activityId, studentId, score: parsed });
    }
    if (bad.length) throw new UserError(`Scores must be between 0 and 3 (e.g. 2.5). Not saved: ${bad.slice(0, 5).join(", ")}.`);

    let changed = 0;
    await prisma.$transaction(async (tx) => {
      for (const u of upserts) {
        await tx.activityScore.upsert({
          where: { activityId_studentId: { activityId: u.activityId, studentId: u.studentId } },
          update: { score: u.score, enteredById: user.id },
          create: { ...u, enteredById: user.id },
        });
        changed++;
      }
      for (const c of clears) changed += (await tx.activityScore.deleteMany({ where: c })).count;
      for (const sid of ids) {
        const raw = fd.get(`r_${sid}`);
        if (raw === null) continue;
        const remark = String(raw).trim().slice(0, 200);
        if (remark) {
          await tx.competencyRemark.upsert({
            where: { termId_studentId_subjectId: { termId, studentId: sid, subjectId } },
            update: { remark, enteredById: user.id },
            create: { termId, studentId: sid, subjectId, remark, enteredById: user.id },
          });
        } else {
          await tx.competencyRemark.deleteMany({ where: { termId, studentId: sid, subjectId } });
        }
      }
      await audit(user.id, "SAVE_ACTIVITY_SCORES", "Stream", streamId, { termId, subjectId, scores: upserts.length, cleared: clears.length }, tx);
    }, { timeout: 60_000 });
    return { ok: true, message: `Saved ${upserts.length} score(s) and remarks for ${ids.size} learners.${changed === 0 && upserts.length === 0 ? " (No scores entered.)" : ""}` };
  },
);
