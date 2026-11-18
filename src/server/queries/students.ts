import type { Prisma } from "@prisma/client";
import { sp, type SP } from "@/components/data-table";

export const MISSING_OPTIONS = [
  { value: "photo", label: "No photo" },
  { value: "lin", label: "No LIN" },
  { value: "schoolpay", label: "No SchoolPay code" },
  { value: "guardian", label: "No parent / guardian" },
  { value: "dob", label: "No date of birth" },
] as const;

/** Splits the search box into words ("Achieng  Moses" → ["Achieng", "Moses"]), at most 6. */
export function searchTokens(q: string | undefined): string[] {
  return (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
}

/** One word of the search: it must appear in at least one of these fields. */
function tokenWhere(t: string): Prisma.StudentWhereInput {
  const ci = { contains: t, mode: "insensitive" as const };
  const phones = [t];
  // Local numbers are stored in international form: 0772… → match …772…
  if (/^0\d{3,}$/.test(t)) phones.push(t.slice(1));
  return {
    OR: [
      { admissionNo: ci }, { firstName: ci }, { lastName: ci }, { otherNames: ci },
      { unebIndexNo: ci }, { linNumber: ci }, { schoolPayCode: ci },
      // A class code typed on its own, e.g. "moses s1"
      { schoolClass: { code: { equals: t, mode: "insensitive" as const } } },
      { guardians: { some: { guardian: { OR: [{ fullName: ci }, ...phones.flatMap((p) => [{ phone: { contains: p } }, { altPhone: { contains: p } }])] } } } },
    ],
  };
}

function missingWhere(m: string | undefined): Prisma.StudentWhereInput {
  switch (m) {
    case "photo": return { photoFileId: null };
    case "lin": return { OR: [{ linNumber: null }, { linNumber: "" }] };
    case "schoolpay": return { OR: [{ schoolPayCode: null }, { schoolPayCode: "" }] };
    case "guardian": return { guardians: { none: {} } };
    case "dob": return { dateOfBirth: null };
    default: return {};
  }
}

/**
 * Student list filters (list page and Excel export). Every word typed in the search box must match
 * a name, admission no., LIN, SchoolPay code, UNEB index, class code (S1…S6), or a parent's name / phone.
 */
export function studentWhere(params: SP): Prisma.StudentWhereInput {
  const status = sp(params, "status") ?? "ACTIVE";
  const subjectId = sp(params, "subjectId");
  return {
    AND: [
      ...searchTokens(sp(params, "q")).map(tokenWhere),
      sp(params, "classId") ? { classId: sp(params, "classId") } : {},
      sp(params, "streamId") ? { streamId: sp(params, "streamId") } : {},
      sp(params, "gender") ? { gender: sp(params, "gender") as "MALE" | "FEMALE" } : {},
      sp(params, "residence") ? { residence: sp(params, "residence") as "DAY" | "BOARDING" } : {},
      sp(params, "combinationId") ? { combinationId: sp(params, "combinationId") } : {},
      subjectId ? { subjects: { some: { subjectId, academicYear: { isCurrent: true } } } } : {},
      missingWhere(sp(params, "missing")),
      status === "ALL" ? {} : { status: status as Prisma.EnumStudentStatusFilter["equals"] },
    ],
  };
}
