import { cache } from "react";
import { prisma } from "@/lib/db";

export const getSchool = cache(async () => {
  const s = await prisma.schoolSetting.findUnique({ where: { id: 1 } });
  return (
    s ?? {
      id: 1, name: "Bishop Ogez High School", motto: null, address: null, poBox: null, website: "www.bishopogez.com",
      email: "ogezhigh@gmail.com", altEmail: null, phone: "+256 772 314 931", altPhone: null, logoFileId: null, headSignatureFileId: null, themeColor: null, centreNumberUce: null,
      centreNumberUace: null, reportFooter: null, headteacherName: null, reportTemplate: {}, notificationPrefs: {}, updatedAt: new Date(),
    }
  );
});

export const getCurrentTerm = cache(async () => {
  return prisma.term.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
});

export const getCurrentYear = cache(async () => {
  return prisma.academicYear.findFirst({ where: { isCurrent: true } });
});
