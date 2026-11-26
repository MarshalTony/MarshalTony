/** Dashboard "what to do next" rules (unit-tested). */

export type SetupCounts = {
  currentTerm: boolean; students: number; allocations: number;
  teachersWithoutLogin: number; streamsWithoutClassTeacher: number;
  headName: boolean; headSignature: boolean; oLevelClassesWithoutChapters: number; examsThisTerm: number;
  studentsWithoutSubjects: number; daysSinceBackup: number | null;
};
export type SetupItem = { key: string; done: boolean; title: string; detail: string; href: string };

/** The school's set-up checklist, in the order to do it. */
export function setupItems(c: SetupCounts): SetupItem[] {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [
    { key: "term", done: c.currentTerm, title: "Current year and term", detail: c.currentTerm ? "Set." : "Choose the current year and term.", href: "/settings/academic" },
    { key: "students", done: c.students > 0, title: "Students registered", detail: c.students ? `${c.students.toLocaleString()} active students.` : "Import the student list or use Quick registration.", href: "/students" },
    { key: "subjects", done: c.students > 0 && c.studentsWithoutSubjects === 0, title: "Every student has subjects", detail: c.studentsWithoutSubjects ? `${n(c.studentsWithoutSubjects, "student has", "students have")} no subjects this year.` : "Done.", href: "/students/data-check" },
    { key: "allocations", done: c.allocations > 0, title: "Teachers allocated to subjects", detail: c.allocations ? `${c.allocations} allocations this year.` : "Allocate teachers to subjects and streams.", href: "/academics/grid" },
    { key: "logins", done: c.teachersWithoutLogin === 0, title: "Teachers can sign in", detail: c.teachersWithoutLogin ? `${n(c.teachersWithoutLogin, "allocated teacher has", "allocated teachers have")} no login yet.` : "Every allocated teacher has a login.", href: "/staff/logins" },
    { key: "classTeachers", done: c.streamsWithoutClassTeacher === 0, title: "Class teachers assigned", detail: c.streamsWithoutClassTeacher ? `${n(c.streamsWithoutClassTeacher, "stream with students has", "streams with students have")} no class teacher.` : "Every stream has a class teacher.", href: "/settings/classes" },
    { key: "head", done: c.headName && c.headSignature, title: "Headteacher's name and signature", detail: !c.headName ? "Add the headteacher's name." : c.headSignature ? "Both set; the signature prints on report cards." : "Add the signature so it prints on report cards.", href: "/settings" },
    { key: "chapters", done: c.oLevelClassesWithoutChapters === 0, title: "Activities of Integration chapters (S1–S4)", detail: c.oLevelClassesWithoutChapters ? `${n(c.oLevelClassesWithoutChapters, "O-Level class has", "O-Level classes have")} no chapters this term.` : "Chapters added for every O-Level class.", href: "/scores?type=activity" },
    { key: "exam", done: c.examsThisTerm > 0, title: "Examination for this term", detail: c.examsThisTerm ? `${n(c.examsThisTerm, "exam", "exams")} this term.` : "Create this term's first examination.", href: "/exams" },
    { key: "backup", done: c.daysSinceBackup !== null && c.daysSinceBackup <= 14, title: "Recent backup", detail: c.daysSinceBackup === null ? "No backup downloaded yet." : c.daysSinceBackup <= 14 ? `Last backup ${c.daysSinceBackup === 0 ? "today" : `${c.daysSinceBackup} day(s) ago`}.` : `Last backup ${c.daysSinceBackup} days ago — download a new one.`, href: "/settings/backup" },
  ];
}
