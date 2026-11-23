import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { defaultSubjectIds } from "@/server/students";
import { classSubjectStatus } from "@/server/class-subjects";
import { testClass } from "./helpers";

describe("subjects by class", async () => {
  const s1 = await testClass(41), s3 = await testClass(43);
  const [eng, kis, lug] = await Promise.all(["ENG", "KIS", "LUG"].map((code) => prisma.subject.findUniqueOrThrow({ where: { code } })));
  // Kiswahili: compulsory in this "S1", optional in this "S3"; Luganda not offered in "S3".
  await prisma.classSubject.createMany({ data: [
    { classId: s1.id, subjectId: kis.id, status: "COMPULSORY" },
    { classId: s3.id, subjectId: kis.id, status: "OPTIONAL" },
    { classId: s3.id, subjectId: lug.id, status: "NOT_OFFERED" },
  ] });

  it("gives new students the compulsory subjects of their class only", async () => {
    const a = await prisma.$transaction((tx) => defaultSubjectIds(tx, s1.id, null));
    const b = await prisma.$transaction((tx) => defaultSubjectIds(tx, s3.id, null));
    expect(a).toContain(kis.id);
    expect(b).not.toContain(kis.id);
    expect(a).toContain(eng.id); // a compulsory subject with no class setting stays compulsory
    expect(b).toContain(eng.id);
  });

  it("reports each subject's status in the class", async () => {
    const { status } = await prisma.$transaction((tx) => classSubjectStatus(tx, s3.id));
    expect(status.get(kis.id)).toBe("OPTIONAL");
    expect(status.get(lug.id)).toBe("NOT_OFFERED");
    expect(status.get(eng.id)).toBe("COMPULSORY");
  });
});
