import "server-only";
import { prisma } from "@/lib/db";
import { AGE_BANDS, ageBand, crossBySex } from "@/lib/enrolment";

export const VIEWS = ["class", "age", "residence", "admissions", "leavers"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABEL: Record<View, string> = {
  class: "By class and stream", age: "By age and class (EMIS)", residence: "Day / boarding", admissions: "New admissions this year", leavers: "Leavers this year",
};

type Col = { key: string; header: string; width?: number; align?: "left" | "right" | "center" };
export type StatTable = { title: string; subtitle: string; columns: Col[]; rows: Record<string, string | number>[]; totals: Record<string, string | number> };

const LEAVE_LABEL: Record<string, string> = { GRADUATED: "Completed / graduated", TRANSFERRED: "Transferred", WITHDRAWN: "Withdrawn", EXPELLED: "Expelled" };

/** One enrolment-statistics table (shared by the page and the Excel / PDF download). Active students unless stated. */
export async function enrolmentTable(view: View): Promise<StatTable> {
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const yearName = year?.name ?? String(new Date().getFullYear());
  const yearStart = new Date(Date.UTC(Number(yearName.slice(0, 4)) || new Date().getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 0, 1));
  const classes = await prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } });
  const sexCols = (key: string, header: string): Col[] => [{ key: `${key}_M`, header: `${header} M`, align: "right" }, { key: `${key}_F`, header: `${header} F`, align: "right" }, { key: `${key}_T`, header: `${header} Total`, align: "right" }];
  const sum = (rows: Record<string, string | number>[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)]));

  if (view === "class" || view === "residence") {
    const students = await prisma.student.findMany({ where: { status: "ACTIVE" }, select: { classId: true, streamId: true, gender: true, residence: true } });
    const rows: Record<string, string | number>[] = [];
    for (const c of classes) for (const st of [...c.streams, null]) {
      const list = students.filter((s) => s.classId === c.id && (st ? s.streamId === st.id : true));
      if (st === null && c.streams.length <= 1) continue; // class subtotal only when there are several streams
      const M = list.filter((s) => s.gender === "MALE"), F = list.filter((s) => s.gender === "FEMALE");
      const row: Record<string, string | number> = { cls: st ? `${c.name} ${st.name}` : `${c.name} — total`, total_M: M.length, total_F: F.length, total_T: list.length };
      if (view === "residence") {
        for (const [k, r] of [["day", "DAY"], ["brd", "BOARDING"]] as const) {
          row[`${k}_M`] = M.filter((s) => s.residence === r).length; row[`${k}_F`] = F.filter((s) => s.residence === r).length;
          row[`${k}_T`] = list.filter((s) => s.residence === r).length;
        }
      }
      rows.push(row);
    }
    const detail = rows.filter((r) => !String(r.cls).endsWith("— total"));
    const keys = view === "residence" ? ["day_M", "day_F", "day_T", "brd_M", "brd_F", "brd_T", "total_M", "total_F", "total_T"] : ["total_M", "total_F", "total_T"];
    return {
      title: view === "class" ? "Enrolment by class and stream" : "Enrolment: day and boarding",
      subtitle: `Active students, ${yearName}`,
      columns: [{ key: "cls", header: "Class / stream", width: 26 }, ...(view === "residence" ? [...sexCols("day", "Day"), ...sexCols("brd", "Boarding")] : []), ...sexCols("total", "All")],
      rows, totals: { cls: "School total", ...sum(detail, keys) },
    };
  }

  if (view === "age") {
    const students = await prisma.student.findMany({ where: { status: "ACTIVE" }, select: { classId: true, gender: true, dateOfBirth: true } });
    const code = new Map(classes.map((c) => [c.id, c.code]));
    const t = crossBySex(students, (s) => ageBand(s.dateOfBirth, yearStart), (s) => code.get(s.classId) ?? "?", (s) => s.gender);
    const rows = AGE_BANDS.filter((b) => t.has(b)).map((b) => {
      const row: Record<string, string | number> = { age: b };
      let M = 0, F = 0;
      for (const c of classes) { const v = t.get(b)!.get(c.code) ?? { M: 0, F: 0 }; row[`${c.code}_M`] = v.M; row[`${c.code}_F`] = v.F; M += v.M; F += v.F; }
      row.all_M = M; row.all_F = F; row.all_T = M + F;
      return row;
    });
    const keys = [...classes.flatMap((c) => [`${c.code}_M`, `${c.code}_F`]), "all_M", "all_F", "all_T"];
    return {
      title: "Enrolment by age, class and sex", subtitle: `Active students; age on 1 January ${yearStart.getUTCFullYear()}`,
      columns: [{ key: "age", header: "Age", width: 10 }, ...classes.flatMap((c) => [{ key: `${c.code}_M`, header: `${c.code} M`, align: "right" as const }, { key: `${c.code}_F`, header: `${c.code} F`, align: "right" as const }]), ...sexCols("all", "All")],
      rows, totals: { age: "Total", ...sum(rows, keys) },
    };
  }

  if (view === "admissions") {
    const students = await prisma.student.findMany({ where: { admissionDate: { gte: yearStart, lt: yearEnd } }, select: { classId: true, gender: true } });
    const rows = classes.map((c) => {
      const list = students.filter((s) => s.classId === c.id);
      return { cls: c.name, new_M: list.filter((s) => s.gender === "MALE").length, new_F: list.filter((s) => s.gender === "FEMALE").length, new_T: list.length };
    });
    return { title: "New admissions", subtitle: `Admitted between 1 January and 31 December ${yearStart.getUTCFullYear()} (by current class)`, columns: [{ key: "cls", header: "Class", width: 20 }, ...sexCols("new", "New")], rows, totals: { cls: "Total", ...sum(rows, ["new_M", "new_F", "new_T"]) } };
  }

  // leavers
  const left = await prisma.student.findMany({ where: { status: { in: ["GRADUATED", "TRANSFERRED", "WITHDRAWN", "EXPELLED"] }, exitDate: { gte: yearStart, lt: yearEnd } }, select: { classId: true, gender: true, status: true } });
  const rows = classes.flatMap((c) => Object.keys(LEAVE_LABEL).map((st) => {
    const list = left.filter((s) => s.classId === c.id && s.status === st);
    return { cls: c.name, reason: LEAVE_LABEL[st], left_M: list.filter((s) => s.gender === "MALE").length, left_F: list.filter((s) => s.gender === "FEMALE").length, left_T: list.length };
  })).filter((r) => r.left_T > 0);
  return { title: "Leavers", subtitle: `Students who left during ${yearStart.getUTCFullYear()}, by class and reason`, columns: [{ key: "cls", header: "Class", width: 16 }, { key: "reason", header: "Reason", width: 22 }, ...sexCols("left", "Left")], rows, totals: { cls: "Total", reason: "", ...sum(rows, ["left_M", "left_F", "left_T"]) } };
}
