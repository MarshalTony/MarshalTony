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
      isComposite: zs.bool(), componentIds: zs.ids(), autoSubjects: zs.bool(), maxMarks: z.coerce.number().positive().max(1000).default(100),
    }),
  },
  async ({ classIds, componentIds, autoSubjects, maxMarks, ...data }, user, fd) => {
    if (!classIds.length) throw new UserError("Choose at least one class.");
    const weights = componentIds.map((id) => Number(fd.get(`weight_${id}`) ?? 0));
    if (data.isComposite) {
      if (componentIds.length < 1) throw new UserError("A combined exam needs component exams.");
      if (weights.some((w) => !(w > 0))) throw new UserError("Give every component a weight greater than 0.");
    }
    const exam = await prisma.$transaction(async (tx) => {
      const term = await tx.term.findUniqueOrThrow({ where: { id: data.termId } });
      const exam = await tx.exam.create({ data: { ...data, classes: { create: classIds.map((classId) => ({ classId })) } } });
      if (data.isComposite) {
        await tx.examComponent.createMany({ data: componentIds.map((componentExamId, i) => ({ compositeExamId: exam.id, componentExamId, weight: weights[i] })) });
      }
      if (autoSubjects) {
        // Every subject that students in the class take this year.
        for (const classId of classIds) {
          const subs = await tx.studentSubject.findMany({ where: { academicYearId: term.academicYearId, student: { classId, status: "ACTIVE" } }, distinct: ["subjectId"], select: { subjectId: true } });
          if (subs.length) await tx.examSubject.createMany({ data: subs.map((s) => ({ examId: exam.id, classId, subjectId: s.subjectId, maxMarks: data.isComposite ? 100 : maxMarks })) });
        }
      }
      await audit(user.id, "CREATE", "Exam", exam.id, { name: data.name, classIds, componentIds, weights }, tx);
      return exam;
    });
    return { ok: true, message: "Examination created.", redirect: `/exams/${exam.id}` };
  },
);

export const setExamStatus = action(
  { permission: "exams.manage", schema: z.object({ examId: zs.id(), status: z.enum(["DRAFT", "OPEN", "CLOSED", "PUBLISHED"]) }) },
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
  { permission: "exams.manage", revalidate: "/exams", schema: z.object({ examId: zs.id() }) },
  async ({ examId }, user) => {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { _count: { select: { marks: true, usedIn: true } } } });
    if (exam._count.marks > 0) throw new UserError("This exam has marks and cannot be deleted. Close it instead.");
    if (exam._count.usedIn > 0) throw new UserError("This exam is a component of a combined exam.");
    await prisma.exam.delete({ where: { id: examId } });
    await audit(user.id, "DELETE", "Exam", examId, { name: exam.name });
    return { ok: true, message: "Exam deleted.", redirect: "/exams" };
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
