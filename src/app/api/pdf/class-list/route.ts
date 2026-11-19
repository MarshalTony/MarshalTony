import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { studentWhere, MISSING_OPTIONS } from "@/server/queries/students";
import { renderClassList, LAYOUTS, COLUMNS, CONTACT_COLUMNS, type Column, type Layout } from "@/server/reports/class-list";
import { pdfResponse } from "@/server/http";
import { audit } from "@/server/audit";
import { studentName } from "@/lib/utils";

export const maxDuration = 60;

const LAYOUT_TITLE: Record<Layout, string> = {
  nominal: "NOMINAL ROLL", attendance: "ATTENDANCE / ROLL-CALL SHEET", marks: "MARK SHEET", contacts: "PARENTS' CONTACT LIST", photos: "PHOTO REGISTER",
};

/**
 * Printable class lists from the Students filters (same query parameters as /students), plus:
 * layout, cols (nominal), blank (number of empty columns), labels (comma-separated headings),
 * title, sort (name | adm | stream), landscape (1).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);
  const layout = (LAYOUTS as readonly string[]).includes(params.layout) ? (params.layout as Layout) : "nominal";
  const columns = (params.cols ?? "").split(",").filter((c): c is Column => c in COLUMNS);
  const blank = Math.min(Math.max(Number(params.blank) || (layout === "attendance" ? 12 : 5), 0), layout === "attendance" ? 20 : 10);
  const blankLabels = (params.labels ?? "").split(",").map((x) => x.trim().slice(0, 14)).filter(Boolean).slice(0, 10);
  const sort = params.sort === "adm" ? "adm" : params.sort === "stream" ? "stream" : "name";

  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sort === "adm" ? [{ admissionNo: "asc" }]
    : sort === "stream" ? [{ schoolClass: { order: "asc" } }, { stream: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }]
    : [{ lastName: "asc" }, { firstName: "asc" }];
  const limit = layout === "photos" || columns.includes("photo") ? 600 : 2500;
  const where = studentWhere(params);
  const total = await prisma.student.count({ where });
  if (total > limit) return new Response(`Too many students (${total}) for one PDF — narrow the filters (maximum ${limit}).`, { status: 400 });

  const needContacts = layout === "contacts" || columns.some((c) => CONTACT_COLUMNS.includes(c));
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  const students = await prisma.student.findMany({
    where, orderBy,
    include: {
      schoolClass: true, stream: true,
      guardians: needContacts ? { include: { guardian: true }, orderBy: { isPrimary: "desc" } } : false,
      subjects: columns.includes("subjects") && year ? { where: { academicYearId: year.id }, include: { subject: true } } : false,
    },
  });

  // Parents' phone numbers: student/parent managers, or a class teacher printing their own stream(s).
  if (needContacts && !can(user, "students.manage", "guardians.manage")) {
    const own = user.staffId ? new Set((await prisma.stream.findMany({ where: { classTeacherId: user.staffId }, select: { id: true } })).map((x) => x.id)) : new Set<string>();
    if (!students.every((x) => own.has(x.streamId))) return new Response("Parents' contacts can only be printed by the office or by the class teacher for their own stream.", { status: 403 });
  }

  // Title from the filters, e.g. "Senior 2 A — Literature in English".
  const [cls, stream, subject, combo] = await Promise.all([
    params.classId ? prisma.schoolClass.findUnique({ where: { id: params.classId } }) : null,
    params.streamId ? prisma.stream.findUnique({ where: { id: params.streamId }, include: { schoolClass: true } }) : null,
    params.subjectId ? prisma.subject.findUnique({ where: { id: params.subjectId } }) : null,
    params.combinationId ? prisma.subjectCombination.findUnique({ where: { id: params.combinationId } }) : null,
  ]);
  const scope = [
    stream ? `${stream.schoolClass.name} ${stream.name}` : cls?.name ?? "All classes",
    subject?.name, combo?.code,
    params.gender === "MALE" ? "Boys" : params.gender === "FEMALE" ? "Girls" : null,
    params.residence === "DAY" ? "Day scholars" : params.residence === "BOARDING" ? "Boarders" : null,
    MISSING_OPTIONS.find((m) => m.value === params.missing)?.label,
    params.status && params.status !== "ACTIVE" ? (params.status === "ALL" ? "All statuses" : params.status.toLowerCase()) : null,
    params.q ? `search "${params.q}"` : null,
  ].filter(Boolean).join(" — ");
  const title = (params.title?.trim().slice(0, 120) || `${LAYOUT_TITLE[layout]}: ${scope}`).toUpperCase();
  const subtitle = [params.title?.trim() ? scope : null, year ? `Academic year ${year.name}` : null].filter(Boolean).join(" · ");

  const buf = await renderClassList(
    students.map((x) => {
      const g = (x as any).guardians?.[0]?.guardian as { fullName: string; phone: string; altPhone: string | null } | undefined;
      return {
        id: x.id, admissionNo: x.admissionNo, name: studentName(x), gender: x.gender, cls: `${x.schoolClass.code} ${x.stream.name}`, residence: x.residence,
        dateOfBirth: x.dateOfBirth, linNumber: x.linNumber, schoolPayCode: x.schoolPayCode, photoFileId: x.photoFileId,
        parent: g?.fullName ?? "", phone: g ? [g.phone, g.altPhone].filter(Boolean).join(" / ") : "",
        subjects: ((x as any).subjects ?? []).map((ss: any) => ss.subject.shortName || ss.subject.code).sort().join(", "),
      };
    }),
    { layout, title, subtitle, columns, blank, blankLabels, landscape: params.landscape === "1" || layout === "attendance", generatedBy: user.fullName },
  );
  await audit(user.id, "PRINT_CLASS_LIST", "Student", null, { layout, count: students.length, contacts: needContacts, filters: Object.fromEntries(Object.entries(params).filter(([k]) => !["layout", "cols", "blank", "labels", "title", "sort", "landscape"].includes(k))) });
  return pdfResponse(buf, `${layout}-list.pdf`);
}
