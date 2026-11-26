import { describe, expect, it } from "vitest";
import { setupItems } from "@/lib/dashboard";

const base = { currentTerm: true, students: 1082, allocations: 231, teachersWithoutLogin: 0, streamsWithoutClassTeacher: 0, headName: true, headSignature: true, oLevelClassesWithoutChapters: 0, examsThisTerm: 1, studentsWithoutSubjects: 0, daysSinceBackup: 3 };
describe("dashboard set-up checklist", () => {
  it("is all done for a school that is set up", () => {
    expect(setupItems(base).every((i) => i.done)).toBe(true);
  });
  it("explains what is missing", () => {
    const items = setupItems({ ...base, students: 0, teachersWithoutLogin: 45, streamsWithoutClassTeacher: 1, headSignature: false, daysSinceBackup: null });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.students.done).toBe(false);
    expect(byKey.subjects.done).toBe(false); // no students yet
    expect(byKey.logins.detail).toBe("45 allocated teachers have no login yet.");
    expect(byKey.classTeachers.detail).toBe("1 stream with students has no class teacher.");
    expect(byKey.head.detail).toMatch(/Add the signature/);
    expect(byKey.backup.detail).toBe("No backup downloaded yet.");
  });
});
