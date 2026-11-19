import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { clearanceFor, officesUserMayClear } from "@/server/leaving";
import type { CurrentUser } from "@/server/auth";
import { adminUser, student, testClass } from "./helpers";

describe("leaving clearance", async () => {
  const admin = await adminUser();
  const cls = await testClass(7);
  const s = await student(cls.id, cls.streams[0].id);
  const book = await prisma.book.create({ data: { accessionNo: `T-${s.id}`, title: "Test Atlas" } as any });

  it("flags open discipline cases and unreturned books, and shows sign-offs", async () => {
    await prisma.disciplineIncident.create({ data: { studentId: s.id, date: new Date(), category: "Test", severity: "MINOR", description: "x", reportedById: admin.id } });
    await prisma.libraryLoan.create({ data: { bookId: book.id, studentId: s.id, dueDate: new Date(), issuedById: admin.id } });
    let rows = (await clearanceFor([s.id])).get(s.id)!;
    expect(rows.map((r) => r.office)).toEqual(["BURSAR", "LIBRARY", "STORES", "DISCIPLINE", "CLASS_TEACHER"]);
    expect(rows.find((r) => r.office === "DISCIPLINE")!.check.issue).toMatch(/1 open discipline/);
    expect(rows.find((r) => r.office === "LIBRARY")!.check.issue).toMatch(/Test Atlas/);
    expect(rows.find((r) => r.office === "BURSAR")!.check.issue).toBeNull();
    expect(rows.every((r) => !r.cleared)).toBe(true);

    await prisma.studentClearance.create({ data: { studentId: s.id, office: "STORES", clearedById: admin.id, note: "Mattress returned" } });
    rows = (await clearanceFor([s.id])).get(s.id)!;
    expect(rows.find((r) => r.office === "STORES")!.cleared).toMatchObject({ by: admin.fullName, note: "Mattress returned" });
  });

  it("lets each office clear only its own line", async () => {
    const bursar: CurrentUser = { ...admin, roles: ["BURSAR"], permissions: new Set(["students.view", "fees.collect"]) };
    expect([...(await officesUserMayClear(bursar, s))]).toEqual(["BURSAR"]);
    expect((await officesUserMayClear(admin, s)).size).toBe(5);
  });
});
