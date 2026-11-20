"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { audit } from "../audit";
import { can } from "../auth";
import { generateResults } from "../exams/results";
import { parseMarkInput, saveMarks, canEnterMarks, type MarkEntry } from "../exams/marks";
import { sendMessage, renderTemplate } from "../messaging";

export const createExam = action(
  {
    permission: "exams.manage",
    revalidate: "/exams",
    schema: z.object({
      name: zs.str(120), examTypeId: zs.id(), termId: zs.id(), classIds: zs.ids(), startDate: zs.optDate(), endDate: zs.optDate(),
      isComposite: zs.bool(), componentIds: zs.ids(), autoSubjects: zs.bool(), openNow: zs.bool(),
      // O-Level end-of-term papers are usually out of 80 (activities add 20); A-Level has no activities, so out of 100.
      maxMarks: z.coerce.number().positive().max(1000).default(100), maxMarksA: z.coerce.number().positive().max(1000).default(100),
    }),
  },
  async ({ classIds, componentIds, autoSubjects, maxMarks, maxMarksA, openNow, ...data }, user, fd) => {
    if (!classIds.length) throw new UserError("Choose at least one class.");
    const weights = componentIds.map((id) => Number(fd.get(`weight_${id}`) ?? 0));
    if (data.isComposite) {
      if (componentIds.length < 1) throw new UserError("A combined exam needs component exams.");
      if (weights.some((w) => !(w > 0))) throw new UserError("Give every component a weight greater than 0.");
    }
    const exam = await prisma.$transaction(async (tx) => {
      const term = await tx.term.findUniqueOrThrow({ where: { id: data.termId } });
      const exam = await tx.exam.create({ data: { ...data, classes: { create: classIds.map((classId) => ({ classId })) } } });
      const levels = new Map((await tx.schoolClass.findMany({ where: { id: { in: classIds } }, select: { id: true, level: true } })).map((c) => [c.id, c.level]));
      if (data.isComposite) {
        await tx.examComponent.createMany({ data: componentIds.map((componentExamId, i) => ({ compositeExamId: exam.id, componentExamId, weight: weights[i] })) });
      }
      if (autoSubjects) {
        // Every subject that students in the class take this year.
        for (const classId of classIds) {
          const subs = await tx.studentSubject.findMany({ where: { academicYearId: term.academicYearId, student: { classId, status: "ACTIVE" } }, distinct: ["subjectId"], select: { subjectId: true } });
          const max = data.isComposite ? 100 : levels.get(classId) === "A_LEVEL" ? maxMarksA : maxMarks;
          if (subs.length) await tx.examSubject.createMany({ data: subs.map((s) => ({ examId: exam.id, classId, subjectId: s.subjectId, maxMarks: max })) });
        }
      }
      // Open for marks entry straight away (no separate step for the DOS) when there are subjects to enter.
      if (openNow && !data.isComposite && (await tx.examSubject.count({ where: { examId: exam.id } })) > 0) {
        await tx.exam.update({ where: { id: exam.id }, data: { status: "OPEN" } });
      }
      await audit(user.id, "CREATE", "Exam", exam.id, { name: data.name, classIds, componentIds, weights }, tx);
      return exam;
    });
    return { ok: true, message: openNow && !data.isComposite ? "Examination created and open for marks entry." : "Examination created.", redirect: `/exams/${exam.id}` };
  },
);

export const setExamStatus = action(
  { permission: "exams.manage", revalidate: "/exams", schema: z.object({ examId: zs.id(), status: z.enum(["DRAFT", "OPEN", "CLOSED", "PUBLISHED"]) }) },
  async ({ examId, status }, user) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { _count: { select: { results: true, subjects: true } } } });
    if (status === "OPEN" && exam._count.subjects === 0) throw new UserError("Configure subjects before opening marks entry.");
    if (status === "PUBLISHED" && exam._count.results === 0) throw new UserError("Generate results before publishing.");
    await prisma.exam.update({ where: { id: examId }, data: { status } });
    await audit(user.id, "SET_STATUS", "Exam", examId, { from: exam.status, to: status });
    const label = { DRAFT: "returned to draft", OPEN: "opened for marks entry", CLOSED: "closed for marks entry", PUBLISHED: "published to parents and students" }[status];
    return { ok: true, message: `Examination ${label}.` };
  },
);

export const saveExamSubjects = action(
  { permission: "exams.manage", schema: z.object({ examId: zs.id(), classId: zs.id(), subjectIds: zs.ids() }) },
  async ({ examId, classId, subjectIds }, user, fd) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const existing = await prisma.examSubject.findMany({ where: { examId, classId } });
    const removed = existing.filter((e) => !subjectIds.includes(e.subjectId));
    if (removed.length) {
      const withMarks = await prisma.mark.count({ where: { examId, subjectId: { in: removed.map((r) => r.subjectId) }, student: { classId } } });
      if (withMarks) throw new UserError("Some subjects you un-ticked already have marks. Clear those marks first.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.examSubject.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
      for (const subjectId of subjectIds) {
        const max = exam.isComposite ? 100 : Number(fd.get(`max_${subjectId}`) || 100);
        if (!(max > 0 && max <= 1000)) throw new UserError("Maximum marks must be between 1 and 1000.");
        const date = String(fd.get(`date_${subjectId}`) || "");
        await tx.examSubject.upsert({
          where: { examId_classId_subjectId: { examId, classId, subjectId } },
          update: { maxMarks: max, examDate: date ? new Date(`${date}T00:00:00Z`) : null },
          create: { examId, classId, subjectId, maxMarks: max, examDate: date ? new Date(`${date}T00:00:00Z`) : null },
        });
      }
      await audit(user.id, "CONFIGURE_SUBJECTS", "Exam", examId, { classId, subjectIds }, tx);
    });
    return { ok: true, message: "Exam subjects saved." };
  },
);

export const deleteExam = action(
  { permission: "exams.manage", revalidate: "/exams", schema: z.object({ examId: zs.id(), confirmName: zs.optStr(120) }) },
  async ({ examId, confirmName }, user) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { _count: { select: { marks: true, results: true, usedIn: true } } } });
    if (exam._count.usedIn > 0) throw new UserError("This exam is a component of a combined exam. Delete or edit the combined exam first.");
    // An exam with marks is deleted only when its name is typed exactly (marks and results go with it).
    if (exam._count.marks > 0 && (confirmName ?? "").trim().toLowerCase() !== exam.name.trim().toLowerCase())
      throw new UserError(`This exam has ${exam._count.marks} marks. Type the exam name exactly to delete it with all its marks and results.`);
    await prisma.exam.delete({ where: { id: examId } });
    await audit(user.id, "DELETE", "Exam", examId, { name: exam.name, marks: exam._count.marks, results: exam._count.results });
    return { ok: true, message: `Exam "${exam.name}" deleted${exam._count.marks ? ` with ${exam._count.marks} marks` : ""}.`, redirect: "/exams" };
  },
);

/**
 * Edit an exam: name, type, term, dates and classes. Added classes get their subjects (what students take this year)
 * with the exam's usual maximum mark; a class can be removed only if it has no marks yet.
 */
export const updateExam = action(
  {
    permission: "exams.manage", revalidate: "/exams",
    schema: z.object({ examId: zs.id(), name: zs.str(120), examTypeId: zs.id(), termId: zs.id(), startDate: zs.optDate(), endDate: zs.optDate(), classIds: zs.ids() }),
  },
  async ({ examId, classIds, ...data }, user) => {
    if (!classIds.length) throw new UserError("Choose at least one class.");
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new UserError("The end date is before the start date.");
    const summary = await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: true, classes: { include: { schoolClass: true } }, subjects: true, _count: { select: { marks: true } } } });
      const term = await tx.term.findUniqueOrThrow({ where: { id: data.termId } });
      if (exam._count.marks > 0 && term.academicYearId !== exam.term.academicYearId)
        throw new UserError("This exam has marks, so it can only move to another term of the same year.");
      const before = exam.classes.map((c) => c.classId);
      const added = classIds.filter((c) => !before.includes(c));
      const removed = before.filter((c) => !classIds.includes(c));
      for (const classId of removed) {
        const n = await tx.mark.count({ where: { examId, student: { classId } } });
        if (n) throw new UserError(`${exam.classes.find((c) => c.classId === classId)?.schoolClass.name} already has ${n} marks in this exam and cannot be removed. Clear those marks first.`);
      }
      if (removed.length) {
        await tx.subjectResult.deleteMany({ where: { examId, student: { classId: { in: removed } } } });
        await tx.examResult.deleteMany({ where: { examId, classId: { in: removed } } });
        await tx.examSubject.deleteMany({ where: { examId, classId: { in: removed } } });
        await tx.examClass.deleteMany({ where: { examId, classId: { in: removed } } });
      }
      // Usual maximum mark per level in this exam (e.g. O-Level EOT 80); A-Level defaults to 100 (no activities).
      const allLevels = new Map((await tx.schoolClass.findMany({ where: { id: { in: [...before, ...added] } }, select: { id: true, level: true } })).map((c) => [c.id, c.level]));
      const usualFor = (level: string) => {
        const counts = new Map<number, number>();
        for (const sub of exam.subjects) if (allLevels.get(sub.classId) === level) counts.set(Number(sub.maxMarks), (counts.get(Number(sub.maxMarks)) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top) return top;
        if (level === "A_LEVEL") return 100;
        const any = new Map<number, number>();
        for (const sub of exam.subjects) any.set(Number(sub.maxMarks), (any.get(Number(sub.maxMarks)) ?? 0) + 1);
        return [...any.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 100;
      };
      const usedMax = new Set<number>();
      let subjectsAdded = 0;
      for (const classId of added) {
        await tx.examClass.create({ data: { examId, classId } });
        const subs = await tx.studentSubject.findMany({ where: { academicYearId: term.academicYearId, student: { classId, status: "ACTIVE" } }, distinct: ["subjectId"], select: { subjectId: true } });
        if (subs.length) {
          const max = exam.isComposite ? 100 : usualFor(allLevels.get(classId) ?? "O_LEVEL");
          usedMax.add(max);
          await tx.examSubject.createMany({ data: subs.map((x) => ({ examId, classId, subjectId: x.subjectId, maxMarks: max })), skipDuplicates: true });
          subjectsAdded += subs.length;
        }
      }
      await tx.exam.update({ where: { id: examId }, data });
      await audit(user.id, "UPDATE", "Exam", examId, { ...data, addedClasses: added, removedClasses: removed }, tx);
      return { added: added.length, removed: removed.length, subjectsAdded, maxes: [...usedMax].join(" / ") };
    });
    const parts = [summary.added && `${summary.added} class(es) added with ${summary.subjectsAdded} subject(s) out of ${summary.maxes}`, summary.removed && `${summary.removed} class(es) removed`].filter(Boolean);
    return { ok: true, message: `Examination updated${parts.length ? `: ${parts.join(", ")}` : ""}.` };
  },
);

// ---------------- Marks ----------------
/** The marks grid posts `m_<studentId>` cells. Empty = no mark. */
function entriesFrom(fd: FormData) {
  const entries: MarkEntry[] = [];
  const clear: string[] = [];
  const bad: string[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("m_") || typeof v !== "string") continue;
    const studentId = k.slice(2);
    const parsed = parseMarkInput(v);
    if (parsed === "invalid") bad.push(v);
    else if (parsed === null) clear.push(studentId);
    else entries.push({ studentId, ...parsed });
  }
  if (bad.length) throw new UserError(`Invalid mark(s): ${bad.slice(0, 5).join(", ")}. Use a number, ABS or EX.`);
  return { entries, clear };
}

export const saveMarksAction = action(
  { permission: ["marks.enter", "marks.enter.any", "marks.approve"], schema: z.object({ examId: zs.id(), streamId: zs.id(), subjectId: zs.id(), correction: zs.bool(), reason: zs.optStr(300) }) },
  async ({ examId, streamId, subjectId, correction, reason }, user, fd) => {
    const { entries, clear } = entriesFrom(fd);
    const n = await prisma.$transaction((tx) => saveMarks(tx, { examId, streamId, subjectId, entries, clear, user, correction, reason: reason ?? undefined }), { timeout: 60_000 });
    return { ok: true, message: n ? `${n} mark(s) saved${correction ? " as corrections" : ""}.` : "No changes to save." };
  },
);

export const submitMarks = action(
  { permission: ["marks.enter", "marks.enter.any"], schema: z.object({ examId: zs.id(), streamId: zs.id(), subjectId: zs.id() }) },
  async ({ examId, streamId, subjectId }, user) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { term: true } });
    if (exam.status !== "OPEN") throw new UserError("Marks can only be submitted while the exam is open.");
    if (!(await canEnterMarks(prisma, user, streamId, subjectId, exam.term.academicYearId))) throw new UserError("You are not allocated to this subject and stream.");
    const expected = await prisma.student.count({ where: { streamId, status: "ACTIVE", subjects: { some: { subjectId, academicYearId: exam.term.academicYearId } } } });
    const entered = await prisma.mark.count({ where: { examId, subjectId, student: { streamId, status: "ACTIVE" } } });
    if (entered < expected) throw new UserError(`${expected - entered} student(s) have no mark. Enter a mark, ABS or EX for every student before submitting.`);
    const sub = await prisma.markSubmission.upsert({
      where: { examId_streamId_subjectId: { examId, streamId, subjectId } },
      update: { status: "SUBMITTED", submittedById: user.id, submittedAt: new Date(), reviewNote: null },
      create: { examId, streamId, subjectId, status: "SUBMITTED", submittedById: user.id, submittedAt: new Date() },
    });
    await audit(user.id, "SUBMIT_MARKS", "MarkSubmission", sub.id, { entered });
    return { ok: true, message: "Marks submitted for approval. They are now locked." };
  },
);

export const reviewMarks = action(
  { permission: "marks.approve", schema: z.object({ submissionId: zs.id(), decision: z.enum(["APPROVED", "REJECTED"]), note: zs.optStr(300) }) },
  async ({ submissionId, decision, note }, user) => {
    const sub = await prisma.markSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    if (sub.status !== "SUBMITTED" && !(sub.status === "APPROVED" && decision === "REJECTED"))
      throw new UserError("Only submitted marks can be reviewed.");
    if (decision === "REJECTED" && !note) throw new UserError("Say why the marks are being returned.");
    await prisma.markSubmission.update({ where: { id: submissionId }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note } });
    await audit(user.id, decision === "APPROVED" ? "APPROVE_MARKS" : "RETURN_MARKS", "MarkSubmission", submissionId, { note });
    return { ok: true, message: decision === "APPROVED" ? "Marks approved." : "Marks returned to the teacher for correction." };
  },
);

export const approveAllSubmitted = action(
  { permission: "marks.approve", schema: z.object({ examId: zs.id() }) },
  async ({ examId }, user) => {
    const r = await prisma.markSubmission.updateMany({ where: { examId, status: "SUBMITTED" }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() } });
    await audit(user.id, "APPROVE_ALL_MARKS", "Exam", examId, { count: r.count });
    return { ok: true, message: `${r.count} submission(s) approved.` };
  },
);

export const generateResultsAction = action(
  { permission: "exams.manage", schema: z.object({ examId: zs.id(), includeUnapproved: zs.bool() }) },
  async ({ examId, includeUnapproved }, user) => {
    const summary = await generateResults(examId, { includeUnapproved });
    await audit(user.id, "GENERATE_RESULTS", "Exam", examId, { includeUnapproved, summary });
    const n = summary.reduce((a, s) => a + s.students, 0);
    return { ok: true, message: `Results generated for ${n} students${includeUnapproved ? " (provisional: unapproved marks included)" : ""}.` };
  },
);

// ---------------- Report comments ----------------
export const saveComments = action(
  { permission: ["reports.comment.class", "reports.comment.dos", "reports.comment.head"], schema: z.object({ examId: zs.id(), streamId: zs.id() }) },
  async ({ examId, streamId }, user, fd) => {
    const stream = await prisma.stream.findUniqueOrThrow({ where: { id: streamId } });
    const isClassTeacher = !!user.staffId && stream.classTeacherId === user.staffId;
    const fields: { field: "classTeacherComment" | "dosComment" | "headteacherComment" | "conduct"; ok: boolean }[] = [
      // Class-teacher comments: the stream's class teacher, or anyone with the DOS/head comment rights
      { field: "classTeacherComment", ok: (can(user, "reports.comment.class") && isClassTeacher) || can(user, "reports.comment.dos", "reports.comment.head") },
      { field: "conduct", ok: (can(user, "reports.comment.class") && isClassTeacher) || can(user, "reports.comment.dos", "reports.comment.head") },
      { field: "dosComment", ok: can(user, "reports.comment.dos") },
      { field: "headteacherComment", ok: can(user, "reports.comment.head") },
    ];
    if (!fields.some((f) => f.ok)) throw new UserError("You are not the class teacher of this stream.");
    const students = await prisma.student.findMany({ where: { streamId }, select: { id: true } });
    const ids = new Set(students.map((s) => s.id));
    let n = 0;
    await prisma.$transaction(async (tx) => {
      for (const sid of ids) {
        const data: Record<string, string | null> = {};
        for (const f of fields) {
          const v = fd.get(`${f.field}_${sid}`);
          if (v === null) continue;
          if (!f.ok) continue; // silently ignore fields the user may not edit (they are not rendered for them)
          data[f.field] = String(v).trim().slice(0, 500) || null;
        }
        if (!Object.keys(data).length) continue;
        await tx.reportComment.upsert({ where: { examId_studentId: { examId, studentId: sid } }, update: data, create: { examId, studentId: sid, ...data } });
        n++;
      }
      await audit(user.id, "SAVE_COMMENTS", "Exam", examId, { streamId, students: n }, tx);
    });
    return { ok: true, message: `Comments saved for ${n} students.` };
  },
);

/** Auto-fills empty comments from the grade remark of the student's average (DOS/head convenience). */

export const notifyResults = action(
  { permission: "communication.send", schema: z.object({ examId: zs.id() }) },
  async ({ examId }, user) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    if (exam.status !== "PUBLISHED") throw new UserError("Publish the results first.");
    const tpl = await prisma.messageTemplate.findUnique({ where: { code: "RESULTS_READY" } });
    if (!tpl) throw new UserError("Message template RESULTS_READY is missing.");
    const results = await prisma.examResult.findMany({ where: { examId }, include: { student: { include: { guardians: { where: { isPrimary: true }, include: { guardian: true } } } } } });
    const counts: Record<string, number> = {};
    for (const r of results) {
      const g = r.student.guardians[0]?.guardian;
      if (!g) continue;
      const m = await sendMessage({ channel: tpl.channel as any, to: tpl.channel === "EMAIL" ? g.email ?? "" : g.phone, toName: g.fullName, category: "EXAM", userId: user.id,
        subject: tpl.subject ?? undefined, body: renderTemplate(tpl.body, { guardian: g.fullName, student: `${r.student.firstName} ${r.student.lastName}`, exam: exam.name }) });
      counts[m.status] = (counts[m.status] ?? 0) + 1;
    }
    await audit(user.id, "NOTIFY_RESULTS", "Exam", examId, counts);
    return { ok: true, message: `Notifications: ${Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`).join(", ") || "no guardians found"}.` };
  },
);
