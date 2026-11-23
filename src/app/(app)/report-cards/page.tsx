import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { ReportCardPicker } from "@/components/report-card-picker";
import { Alert, PageHeader } from "@/components/ui/card";

export const metadata = { title: "Report cards" };

export default async function ReportCardsPage() {
  const user = await requirePage("reportcards.generate");
  const [years, terms, exams, classes] = await Promise.all([
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
    prisma.exam.findMany({
      include: { examType: true, classes: true, _count: { select: { marks: true, results: true } } },
      orderBy: [{ examType: { order: "desc" } }, { createdAt: "desc" }],
    }),
    prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Report cards"
        description="Choose the year, term and report, then a class (or one stream), and generate. Or find one student. O-Level end-of-term cards use the school's two-page competency format; others use the standard layout (Settings → School profile)."
      />
      {!years.length ? <Alert tone="warn">Set up the academic year and terms first (Settings → Years & terms).</Alert> : (
        <ReportCardPicker
          years={years.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent }))}
          terms={terms.map((t) => ({ id: t.id, name: t.name, yearId: t.academicYearId, isCurrent: t.isCurrent }))}
          exams={exams.map((e) => ({ id: e.id, name: e.name, termId: e.termId, typeCode: e.examType.code, classIds: e.classes.map((c) => c.classId), ready: e._count.results > 0 || e._count.marks > 0 }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name, streams: c.streams.map((s) => ({ id: s.id, name: s.name })) }))}
          canScoreSheet={can(user, "results.view")}
        />
      )}
    </>
  );
}
