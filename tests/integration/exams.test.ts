import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { saveMarks } from "@/server/exams/marks";
import { generateResults } from "@/server/exams/results";
import type { CurrentUser } from "@/server/auth";
import { adminUser, currentYearAndTerm, student, testClass } from "./helpers";

describe("examination results (database)", async () => {
  const admin = await adminUser();
  const { year, term } = await currentYearAndTerm();
  const cls = await testClass(2);
  const [A, B] = cls.streams;
  const sub = Object.fromEntries((await prisma.subject.findMany({ where: { code: { in: ["ENG", "MTC", "BIO"] } } })).map((s) => [s.code, s.id]));
  const type = await prisma.examType.findUniqueOrThrow({ where: { code: "EOT" } });

  // Students and the subjects they take
  const mk = async (streamId: string, codes: string[]) => {
    const s = await student(cls.id, streamId);
    await prisma.studentSubject.createMany({ data: codes.map((c) => ({ studentId: s.id, subjectId: sub[c], academicYearId: year.id })) });
    return s;
  };
  const s1 = await mk(A.id, ["ENG", "MTC", "BIO"]);
  const s2 = await mk(A.id, ["ENG", "MTC", "BIO"]);
  const s6 = await mk(A.id, ["ENG", "MTC", "BIO"]);
  const s3 = await mk(B.id, ["ENG", "MTC", "BIO"]);
  const s4 = await mk(B.id, ["ENG", "MTC", "BIO"]);
  const s5 = await mk(B.id, ["ENG", "MTC"]); // different combination: no Biology

  const exam = await prisma.exam.create({
    data: {
      name: `Integration EOT ${cls.code}`, examTypeId: type.id, termId: term.id, status: "OPEN",
      classes: { create: [{ classId: cls.id }] },
      subjects: { create: [{ classId: cls.id, subjectId: sub.ENG, maxMarks: 100 }, { classId: cls.id, subjectId: sub.MTC, maxMarks: 100 }, { classId: cls.id, subjectId: sub.BIO, maxMarks: 50 }] },
    },
  });
  const P = (studentId: string, score: number) => ({ studentId, score, status: "PRESENT" as const });
  const save = (streamId: string, code: string, entries: any[], user: CurrentUser = admin) =>
    prisma.$transaction((tx) => saveMarks(tx, { examId: exam.id, streamId, subjectId: sub[code], entries, clear: [], user }));

  it("rejects marks above the maximum and saves nothing", async () => {
    await expect(save(A.id, "BIO", [P(s1.id, 60)])).rejects.toThrow(/exceeds maximum/);
    expect(await prisma.mark.count({ where: { examId: exam.id } })).toBe(0);
  });

  it("refuses a teacher who is not allocated to the subject/stream", async () => {
    const staff = await prisma.staff.create({ data: { staffNo: `${cls.code}-T`, firstName: "Tess", lastName: "Teacher", gender: "FEMALE", designation: "Teacher" } });
    const teacher: CurrentUser = { ...admin, id: admin.id, roles: ["TEACHER"], permissions: new Set(["marks.enter"]), staffId: staff.id };
    await expect(save(A.id, "ENG", [P(s1.id, 50)], teacher)).rejects.toThrow(/not allocated/);
    await prisma.teacherAllocation.create({ data: { staffId: staff.id, subjectId: sub.ENG, streamId: A.id, academicYearId: year.id } });
    expect(await save(A.id, "ENG", [P(s1.id, 50)], teacher)).toBe(1);
  });

  it("generates correct totals, tied positions, stream and subject positions", async () => {
    await save(A.id, "ENG", [P(s1.id, 90), P(s2.id, 60), P(s6.id, 40)]);
    await save(A.id, "MTC", [P(s1.id, 80), P(s2.id, 70), { studentId: s6.id, score: null, status: "EXEMPTED" }]);
    await save(A.id, "BIO", [P(s1.id, 40), P(s2.id, 25)]); // s6: no Biology mark (missing)
    await save(B.id, "ENG", [P(s3.id, 90), P(s4.id, 50), P(s5.id, 70)]);
    await save(B.id, "MTC", [P(s3.id, 80), { studentId: s4.id, score: null, status: "ABSENT" }, P(s5.id, 70)]);
    await save(B.id, "BIO", [P(s3.id, 40), P(s4.id, 30)]);

    // Unapproved marks are not used by default
    await generateResults(exam.id);
    const none = await prisma.examResult.findMany({ where: { examId: exam.id } });
    expect(none.every((r) => r.subjectsCount === 0)).toBe(true);

    await prisma.markSubmission.updateMany({ where: { examId: exam.id }, data: { status: "APPROVED" } });
    await generateResults(exam.id);
    const res = Object.fromEntries((await prisma.examResult.findMany({ where: { examId: exam.id } })).map((r) => [r.studentId, r]));
    const avg = (id: string) => Number(res[id].average);
    expect(avg(s1.id)).toBe(83.33);
    expect(avg(s3.id)).toBe(83.33);
    expect(avg(s5.id)).toBe(70);
    expect(avg(s2.id)).toBe(60);
    expect(avg(s4.id)).toBe(55); // absent Mathematics excluded (EXCLUDE policy)
    expect(avg(s6.id)).toBe(40); // exempted + missing excluded
    expect(Number(res[s1.id].total)).toBe(210);

    const pos = (id: string) => res[id].classPosition;
    expect([pos(s1.id), pos(s3.id), pos(s5.id), pos(s2.id), pos(s4.id), pos(s6.id)]).toEqual([1, 1, 3, 4, 5, 6]);
    expect(res[s1.id].classSize).toBe(6);
    expect([res[s1.id].streamPosition, res[s2.id].streamPosition, res[s6.id].streamPosition]).toEqual([1, 2, 3]);
    expect([res[s3.id].streamPosition, res[s5.id].streamPosition, res[s4.id].streamPosition]).toEqual([1, 2, 3]);

    const mtc = Object.fromEntries((await prisma.subjectResult.findMany({ where: { examId: exam.id, subjectId: sub.MTC } })).map((r) => [r.studentId, r]));
    expect([mtc[s1.id].subjectPosition, mtc[s3.id].subjectPosition, mtc[s2.id].subjectPosition, mtc[s5.id].subjectPosition]).toEqual([1, 1, 3, 3]);
    expect(mtc[s4.id].status).toBe("ABSENT");
    expect(mtc[s4.id].subjectPosition).toBeNull();
    const bio = await prisma.subjectResult.findMany({ where: { examId: exam.id, subjectId: sub.BIO } });
    expect(bio.find((b) => b.studentId === s5.id)).toBeUndefined(); // does not take Biology
    expect(bio.find((b) => b.studentId === s6.id)?.status).toBe("MISSING");
    expect(bio.find((b) => b.studentId === s1.id)?.grade).toBe("A"); // 40/50 = 80% on the default A–E scale
  });

  it("locks submitted marks; approver corrections are audited", async () => {
    await prisma.markSubmission.update({ where: { examId_streamId_subjectId: { examId: exam.id, streamId: A.id, subjectId: sub.ENG } }, data: { status: "SUBMITTED" } });
    const teacherish: CurrentUser = { ...admin, permissions: new Set(["marks.enter.any"]) };
    await expect(save(A.id, "ENG", [P(s1.id, 91)], teacherish)).rejects.toThrow(/locked/);
    await expect(prisma.$transaction((tx) => saveMarks(tx, { examId: exam.id, streamId: A.id, subjectId: sub.ENG, entries: [P(s1.id, 91)], clear: [], user: admin, correction: true }))).rejects.toThrow(/reason/);
    await prisma.$transaction((tx) => saveMarks(tx, { examId: exam.id, streamId: A.id, subjectId: sub.ENG, entries: [P(s1.id, 91)], clear: [], user: admin, correction: true, reason: "Marking error" }));
    const log = await prisma.auditLog.findFirst({ where: { action: "MARKS_CORRECTED", entityId: `${exam.id}:${A.id}:${sub.ENG}` } });
    expect(log).not.toBeNull();
    const change = (log!.details as any).changes.find((c: any) => c.studentId === s1.id);
    expect(change).toMatchObject({ from: "90", to: "91" });
  });

  it("combined exam applies the weighted formula", async () => {
    await prisma.markSubmission.updateMany({ where: { examId: exam.id }, data: { status: "APPROVED" } });
    const mot = await prisma.exam.create({ data: { name: `MOT ${cls.code}`, examTypeId: type.id, termId: term.id, status: "OPEN", classes: { create: [{ classId: cls.id }] }, subjects: { create: [{ classId: cls.id, subjectId: sub.ENG, maxMarks: 50 }] } } });
    await prisma.$transaction((tx) => saveMarks(tx, { examId: mot.id, streamId: A.id, subjectId: sub.ENG, entries: [P(s2.id, 40)], clear: [], user: admin })); // 80%
    await prisma.markSubmission.updateMany({ where: { examId: mot.id }, data: { status: "APPROVED" } });
    const term3 = await prisma.exam.create({
      data: { name: `Term final ${cls.code}`, examTypeId: type.id, termId: term.id, isComposite: true, classes: { create: [{ classId: cls.id }] }, subjects: { create: [{ classId: cls.id, subjectId: sub.ENG, maxMarks: 100 }] },
        components: { create: [{ componentExamId: mot.id, weight: 40 }, { componentExamId: exam.id, weight: 60 }] } },
    });
    await generateResults(term3.id);
    const r = await prisma.subjectResult.findFirstOrThrow({ where: { examId: term3.id, studentId: s2.id, subjectId: sub.ENG } });
    expect(Number(r.percentage)).toBe(68); // 0.4*80 + 0.6*60
    const r1 = await prisma.subjectResult.findFirstOrThrow({ where: { examId: term3.id, studentId: s1.id, subjectId: sub.ENG } });
    expect(Number(r1.percentage)).toBe(91); // did not sit MOT → weights re-normalised to the EOT score
  });
});

describe("results after promotion use the exam-year class", async () => {
  const admin = await adminUser();
  const { year, term } = await currentYearAndTerm();
  const from = await testClass(4);
  const to = await testClass(5);
  const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });
  const type = await prisma.examType.findUniqueOrThrow({ where: { code: "BOT" } });
  it("keeps a promoted student's past result in their old class", async () => {
    const st = await student(from.id, from.streams[0].id);
    await prisma.studentSubject.create({ data: { studentId: st.id, subjectId: eng.id, academicYearId: year.id } });
    const exam = await prisma.exam.create({ data: { name: `Promo ${from.code}`, examTypeId: type.id, termId: term.id, status: "OPEN", classes: { create: [{ classId: from.id }] }, subjects: { create: [{ classId: from.id, subjectId: eng.id }] } } });
    await prisma.$transaction((tx) => saveMarks(tx, { examId: exam.id, streamId: from.streams[0].id, subjectId: eng.id, entries: [{ studentId: st.id, score: 77, status: "PRESENT" }], clear: [], user: admin }));
    await prisma.markSubmission.updateMany({ where: { examId: exam.id }, data: { status: "APPROVED" } });
    // Promote: the student's current class changes; the exam-year enrollment does not
    await prisma.student.update({ where: { id: st.id }, data: { classId: to.id, streamId: to.streams[1].id } });
    await generateResults(exam.id);
    const r = await prisma.examResult.findUniqueOrThrow({ where: { examId_studentId: { examId: exam.id, studentId: st.id } } });
    expect(r.classId).toBe(from.id);
    expect(r.streamId).toBe(from.streams[0].id);
    expect(Number(r.average)).toBe(77);
  });
});
