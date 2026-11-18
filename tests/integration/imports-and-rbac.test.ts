import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { IMPORT_KINDS } from "@/server/imports/kinds";
import { DEFAULT_ROLES } from "@/lib/permissions";
import { RUN, testClass } from "./helpers";

describe("Excel import validation", async () => {
  const cls = await testClass(3);
  it("flags duplicates, invalid values and unknown classes without dropping rows", async () => {
    const rows = [
      { rowNumber: 2, values: { admissionNo: `${RUN}/IMP1`, lastName: "Ok", firstName: "A", gender: "M", classCode: cls.code, stream: "A", residence: "DAY", dateOfBirth: "12/05/2011" } },
      { rowNumber: 3, values: { admissionNo: `${RUN}/IMP1`, lastName: "Dup", firstName: "B", gender: "F", classCode: cls.code, stream: "A", residence: "DAY" } },
      { rowNumber: 4, values: { admissionNo: "", lastName: "", firstName: "C", gender: "X", classCode: "S9", stream: "Z", residence: "HOSTEL", dateOfBirth: "31/31/2020" } },
    ];
    const checked = await IMPORT_KINDS.students.check(rows, {});
    expect(checked).toHaveLength(3);
    expect(checked[0].errors).toEqual([]);
    expect(checked[1].errors.join()).toMatch(/Duplicate of row 2/);
    const e = checked[2].errors.join(" | ");
    for (const m of [/Surname is missing/, /Gender must be M or F/, /Unknown class/, /Day\/Boarding/, /Date of birth/]) expect(e).toMatch(m);
  });
  it("detects invalid marks in a marks import", async () => {
    const exam = await prisma.exam.findFirst({ where: { name: { startsWith: "Integration EOT" } }, include: { classes: true } });
    if (!exam) return; // depends on the exam test having run first
    const stream = await prisma.stream.findFirstOrThrow({ where: { classId: exam.classes[0].classId, name: "A" } });
    const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });
    const st = await prisma.student.findFirstOrThrow({ where: { streamId: stream.id } });
    const out = await IMPORT_KINDS.marks.check([
      { rowNumber: 2, values: { admissionNo: st.admissionNo, mark: "150" } },
      { rowNumber: 3, values: { admissionNo: "NOPE/1", mark: "50" } },
      { rowNumber: 4, values: { admissionNo: st.admissionNo, mark: "abc" } },
    ], { examId: exam.id, streamId: stream.id, subjectId: eng.id });
    expect(out[0].errors.join()).toMatch(/between 0 and 100/);
    expect(out[1].errors.join()).toMatch(/not in this stream/);
    expect(out[2].errors.join()).toMatch(/not a valid mark|Duplicate/);
  });
});

describe("role-based access defaults", () => {
  const perms = (code: string) => new Set(DEFAULT_ROLES.find((r) => r.code === code)!.permissions);
  it("keeps teachers away from finance, HR-sensitive data and user admin", () => {
    const t = perms("TEACHER");
    for (const p of ["fees.view", "fees.collect", "finance.view", "hr.sensitive", "users.manage", "marks.approve", "marks.enter.any", "welfare.confidential"]) expect(t.has(p as any)).toBe(false);
    expect(t.has("marks.enter")).toBe(true);
  });
  it("gives parents and students only their portal", () => {
    expect([...perms("PARENT")]).toEqual(["portal.parent"]);
    expect([...perms("STUDENT")]).toEqual(["portal.student"]);
  });
  it("lets the bursar collect fees but not approve their own expenses or marks", () => {
    const b = perms("BURSAR");
    expect(b.has("fees.collect")).toBe(true);
    expect(b.has("finance.approve")).toBe(false);
    expect(b.has("marks.enter")).toBe(false);
  });
});

describe("server action safety", () => {
  // In "use server" files every export becomes a public endpoint, and inline
  // non-async callbacks break the build. Keep helpers and schema callbacks elsewhere.
  const dir = path.resolve(__dirname, "../../src/server/actions");
  for (const f of fs.readdirSync(dir)) {
    it(`${f} only exports server actions`, () => {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src.startsWith('"use server"')).toBe(true);
      const bad = src.split("\n").filter((l) => /^export\s/.test(l) && !/^export const \w+ = action\(/.test(l) && !/^export async function \w+Action\(/.test(l) && !/^export async function logoutAction/.test(l));
      expect(bad).toEqual([]);
      expect(src).not.toMatch(/\.(transform|refine|preprocess)\(/);
    });
  }
});
