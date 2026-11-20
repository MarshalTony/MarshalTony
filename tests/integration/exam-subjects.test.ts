import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncExamSubjects } from "@/server/exams/exam-subjects";
import { currentYearAndTerm, student, testClass } from "./helpers";

describe("exam subjects follow students registered after the exam was created", async () => {
  const { year, term } = await currentYearAndTerm();
  const type = await prisma.examType.findUniqueOrThrow({ where: { code: "BOT" } });
  const o = await testClass(31), a = await testClass(32, "A_LEVEL");
  const [eng, che, gp] = await Promise.all(["ENG", "A-CHE", "GP"].map((code) => prisma.subject.findUniqueOrThrow({ where: { code } })));
  const s1 = await student(o.id, o.streams[0].id);
  await prisma.studentSubject.create({ data: { studentId: s1.id, subjectId: eng.id, academicYearId: year.id } });
  // Exam created when only the O-Level class had students (its subject out of 80); the A-Level class had none yet.
  const exam = await prisma.exam.create({
    data: { name: `BOT sync ${o.code}`, examTypeId: type.id, termId: term.id, status: "OPEN", classes: { create: [{ classId: o.id }, { classId: a.id }] }, subjects: { create: [{ classId: o.id, subjectId: eng.id, maxMarks: 80 }] } },
  });

  it("adds the subjects of students imported later, with the usual maximum per level, and never duplicates", async () => {
    const s2 = await student(a.id, a.streams[1].id), s3 = await student(o.id, o.streams[1].id);
    await prisma.studentSubject.createMany({ data: [{ studentId: s2.id, subjectId: che.id, academicYearId: year.id }, { studentId: s2.id, subjectId: gp.id, academicYearId: year.id }, { studentId: s3.id, subjectId: eng.id, academicYearId: year.id }] });
    expect(await syncExamSubjects(exam.id)).toBe(2);
    const subs = await prisma.examSubject.findMany({ where: { examId: exam.id }, include: { subject: true } });
    expect(subs.map((s) => `${s.classId === a.id ? "A" : "O"}:${s.subject.code}:${Number(s.maxMarks)}`).sort()).toEqual(["A:A-CHE:100", "A:GP:100", "O:ENG:80"]);
    expect(await syncExamSubjects(exam.id)).toBe(0);
  });
});
