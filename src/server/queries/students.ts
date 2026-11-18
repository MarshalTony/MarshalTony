import type { Prisma } from "@prisma/client";
import { sp, type SP } from "@/components/data-table";

export function studentWhere(params: SP): Prisma.StudentWhereInput {
  const q = sp(params, "q");
  const status = sp(params, "status") ?? "ACTIVE";
  return {
    AND: [
      q ? { OR: [
        { admissionNo: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } }, { otherNames: { contains: q, mode: "insensitive" } }, { unebIndexNo: { contains: q, mode: "insensitive" } },
      ] } : {},
      sp(params, "classId") ? { classId: sp(params, "classId") } : {},
      sp(params, "streamId") ? { streamId: sp(params, "streamId") } : {},
      sp(params, "gender") ? { gender: sp(params, "gender") as "MALE" | "FEMALE" } : {},
      sp(params, "residence") ? { residence: sp(params, "residence") as "DAY" | "BOARDING" } : {},
      status === "ALL" ? {} : { status: status as any },
    ],
  };
}

