import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { IMPORT_KINDS, columnsOf } from "@/server/imports/kinds";
import { adminUser, currentYearAndTerm, student, testClass } from "./helpers";

describe("activity scores Excel import", async () => {
  const admin = await adminUser();
  const { year, term } = await currentYearAndTerm();
  const cls = await testClass(8);
  const [A] = cls.streams;
  const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });
  const s1 = await student(cls.id, A.id), s2 = await student(cls.id, A.id);
  await prisma.studentSubject.createMany({ data: [s1, s2].map((s) => ({ studentId: s.id, subjectId: eng.id, academicYearId: year.id })) });
  const ch1 = await prisma.learningActivity.create({ data: { termId: term.id, classId: cls.id, subjectId: eng.id, title: "Drama", order: 1, createdById: admin.id } });
  const ch2 = await prisma.learningActivity.create({ data: { termId: term.id, classId: cls.id, subjectId: eng.id, title: "Poetry", order: 2, createdById: admin.id } });
  const ctx = { termId: term.id, streamId: A.id, subjectId: eng.id };
  const kind = IMPORT_KINDS.activities;

  it("has one column per chapter", async () => {
    const cols = await columnsOf(kind, ctx);
    expect(cols.map((c) => c.header)).toEqual(["Admission No", "Student Name", "1. Drama (/3)", "2. Poetry (/3)", "Competency remark"]);
  });

  it("checks scores and saves valid rows; blank cells leave scores alone", async () => {
    await prisma.activityScore.create({ data: { activityId: ch2.id, studentId: s1.id, score: 1 } });
    const rows = [
      { rowNumber: 2, values: { admissionNo: s1.admissionNo, [`a_${ch1.id}`]: "2.5", [`a_${ch2.id}`]: "", remark: "Good" } },
      { rowNumber: 3, values: { admissionNo: s2.admissionNo, [`a_${ch1.id}`]: "3.5", [`a_${ch2.id}`]: "2" } },
      { rowNumber: 4, values: { admissionNo: "NOPE/1", [`a_${ch1.id}`]: "1" } },
    ];
    const checked = await kind.check(rows, ctx);
    expect(checked[0].errors).toEqual([]);
    expect(checked[1].errors[0]).toMatch(/must be a score from 0 to 3/);
    expect(checked[2].errors[0]).toMatch(/not in this stream/);
    const msg = await prisma.$transaction((tx) => kind.commit(tx, checked.filter((r) => !r.errors.length), ctx, admin));
    expect(msg).toMatch(/1 activity score\(s\) and 1 remark\(s\)/);
    const scores = await prisma.activityScore.findMany({ where: { studentId: s1.id }, orderBy: { activity: { order: "asc" } } });
    expect(scores.map((x) => Number(x.score))).toEqual([2.5, 1]); // Poetry kept (blank cell)
    expect(await prisma.activityScore.count({ where: { studentId: s2.id } })).toBe(0);
  });
});
