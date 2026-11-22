import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { quickRegisterStudents } from "@/server/actions/quick-register";
import { QuickRegisterGrid } from "@/components/quick-register-grid";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";

export const metadata = { title: "Quick registration" };

/** Register many students of one class and stream in one go (typed or pasted from Excel). */
export default async function QuickRegisterPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("students.manage");
  const q = await searchParams;
  const [year, classes, houses] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, include: { streams: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { order: "asc" } }),
    prisma.house.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const cls = classes.find((c) => c.id === sp(q, "classId"));
  const stream = cls?.streams.find((s) => s.id === sp(q, "streamId"));
  const combos = cls?.level === "A_LEVEL" ? await prisma.subjectCombination.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }) : null;
  const count = stream ? await prisma.student.count({ where: { streamId: stream.id, status: "ACTIVE" } }) : 0;

  return (
    <>
      <PageHeader
        title="Quick registration"
        description="Register a whole class list in one go: only names and sex are required. Admission numbers, this year's enrolment and the default subjects are created automatically (A-Level: choose the combination). Add other details later on the profile or in Bulk edit."
        actions={<>
          <Button asChild variant="outline"><Link href="/students/new">Full registration form</Link></Button>
          <Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>
        </>}
      />
      {!year ? <Alert tone="warn">Set the current academic year first (Settings → Years & terms).</Alert> : (
        <>
          <ScorePicker fields={[
            { name: "classId", label: "Class", placeholder: "Select class", value: cls?.id, resets: ["streamId"], options: classes.map((c) => ({ value: c.id, label: c.name })) },
            { name: "streamId", label: "Stream", placeholder: "Select stream", value: stream?.id, options: (cls?.streams ?? []).map((s) => ({ value: s.id, label: s.name })) },
          ]} />
          {!cls || !stream ? <Alert>Choose the class and stream the new students join.</Alert> : (
            <>
              <p className="mb-2 text-sm text-slate-600">
                Registering into <b>{cls.name} {stream.name}</b> ({count} active student{count === 1 ? "" : "s"} already) for {year.name}.
                {" "}<Link className="text-brand-700 underline" href={`/students?classId=${cls.id}&streamId=${stream.id}`}>See the stream list</Link>
                {cls.level === "A_LEVEL" && " Choose each student's combination so they get their subjects (S5–S6: 3 principals + General Paper + Sub-Maths or Sub-ICT)."}
              </p>
              <QuickRegisterGrid
                key={stream.id}
                action={quickRegisterStudents}
                classId={cls.id}
                streamId={stream.id}
                houses={houses.map((h) => ({ value: h.id, label: h.name }))}
                combinations={combos ? combos.map((c) => ({ value: c.id, label: c.code })) : null}
                today={new Date().toISOString().slice(0, 10)}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
