import Link from "next/link";
import { ClipboardList, ListChecks } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { ActivitySheet } from "@/components/sheets/activity-sheet";
import { MarksSheet } from "@/components/sheets/marks-sheet";
import { ScorePicker, type PickerField } from "@/components/score-picker";
import { Alert, PageHeader } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";

export const metadata = { title: "Enter scores" };

const TYPES = {
  activity: { label: "Activity scores", short: "Activities of Integration", hint: "Score each chapter / theme out of 3 during the term (O-Level). Becomes the mark out of 20 on the report." },
  eot: { label: "End of term scores", short: "End of term exam", hint: "Marks for the end-of-term paper (out of 80 for O-Level). Submitted to the Director of Studies for approval." },
} as const;
type ScoreType = keyof typeof TYPES;

export default async function ScoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("marks.enter", "marks.enter.any");
  const q = await searchParams;
  const type = (["activity", "eot"] as const).find((t) => t === sp(q, "type"));
  const elevated = can(user, "marks.enter.any", "marks.approve");

  const tabs = (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      {(Object.keys(TYPES) as ScoreType[]).map((t) => {
        const Icon = t === "activity" ? ListChecks : ClipboardList;
        const active = t === type;
        return (
          <Link key={t} href={`/scores?type=${t}`} className={`flex gap-3 rounded-lg border p-4 transition ${active ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${active ? "text-blue-700" : "text-slate-400"}`} />
            <span><span className="block font-semibold">{TYPES[t].label}</span><span className="text-sm text-slate-600">{TYPES[t].hint}</span></span>
          </Link>
        );
      })}
    </div>
  );
  const header = <PageHeader title="Enter scores" description={elevated ? "Choose what to enter, then the class, subject and term." : "Choose what to enter, then the class, subject and term. You only see the classes and subjects allocated to you."} />;
  if (!type) return <>{header}{tabs}</>;

  const terms = await prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } });
  const term = terms.find((t) => t.id === sp(q, "termId")) ?? terms.find((t) => t.isCurrent) ?? terms[0];
  if (!term) return <>{header}{tabs}<Alert>Set up the academic year and terms first (Settings → Years & terms).</Alert></>;
  const oLevelOnly = type === "activity";

  // Classes (streams) this user may enter for: their allocations for the term's year, or every stream for the DOS.
  const allocs = elevated ? [] : await prisma.teacherAllocation.findMany({
    where: { staffId: user.staffId ?? "-", academicYearId: term.academicYearId, ...(oLevelOnly ? { stream: { schoolClass: { level: "O_LEVEL" } } } : {}) },
    include: { subject: true, stream: { include: { schoolClass: true } } },
    orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { stream: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const streams = elevated
    ? (await prisma.stream.findMany({ where: { isActive: true, ...(oLevelOnly ? { schoolClass: { level: "O_LEVEL" } } : {}) }, include: { schoolClass: true }, orderBy: [{ schoolClass: { order: "asc" } }, { name: "asc" }] }))
    : [...new Map(allocs.map((a) => [a.streamId, a.stream])).values()];
  const stream = streams.find((s) => s.id === sp(q, "streamId"));
  const subjects = !stream ? [] : elevated
    ? await prisma.subject.findMany({ where: { level: stream.schoolClass.level, isActive: true }, orderBy: { name: "asc" } })
    : allocs.filter((a) => a.streamId === stream.id).map((a) => a.subject);
  const subject = subjects.find((s) => s.id === sp(q, "subjectId"));

  const fields: PickerField[] = [
    { name: "streamId", label: "Class", placeholder: "Select class", value: stream?.id, resets: ["subjectId", "examId"], options: streams.map((s) => ({ value: s.id, label: `${s.schoolClass.name} ${s.name}` })) },
    { name: "subjectId", label: "Subject", placeholder: stream ? "Select subject" : "Select a class first", value: subject?.id, resets: ["examId"], options: subjects.map((s) => ({ value: s.id, label: s.name })) },
    { name: "termId", label: "Term", placeholder: "Select term", value: term.id, resets: ["examId"], options: terms.map((t) => ({ value: t.id, label: `${t.name} ${t.academicYear.name}${t.isCurrent ? " (current)" : ""}` })) },
  ];

  // End of term: find the EOT examination the DOS set up for this class and term.
  const exams = type === "eot" && stream
    ? await prisma.exam.findMany({ where: { termId: term.id, isComposite: false, examType: { code: "EOT" }, classes: { some: { classId: stream.classId } } }, orderBy: { createdAt: "desc" } })
    : [];
  if (exams.length > 1) fields.push({ name: "examId", label: "Examination", placeholder: "Select examination", value: (exams.find((e) => e.id === sp(q, "examId")) ?? exams[0]).id, options: exams.map((e) => ({ value: e.id, label: e.name })) });
  const exam = exams.find((e) => e.id === sp(q, "examId")) ?? exams[0];

  let body: React.ReactNode;
  if (streams.length === 0) {
    body = <Alert tone="warn">{elevated ? "No active streams found." : `You have not been allocated any ${oLevelOnly ? "O-Level " : ""}class or subject for ${term.academicYear.name}. Ask the system administrator to allocate you (Classes & Subjects → Teacher allocations).`}</Alert>;
  } else if (!stream) {
    body = <Alert>Select the class you want to enter {TYPES[type].label.toLowerCase()} for.</Alert>;
  } else if (!subject) {
    body = <Alert>Select the subject.</Alert>;
  } else if (type === "activity") {
    body = <ActivitySheet term={term} stream={{ id: stream.id, classId: stream.classId, label: `${stream.schoolClass.code} ${stream.name}` }} subject={subject} elevated={elevated} />;
  } else if (!exam) {
    body = <Alert tone="warn">There is no end-of-term examination for {stream.schoolClass.name} in {term.name} {term.academicYear.name} yet. The Director of Studies creates it under Examinations (type: End of Term) and opens it for marks entry.</Alert>;
  } else {
    const self = `/scores?type=eot&termId=${term.id}&streamId=${stream.id}&subjectId=${subject.id}${exams.length > 1 ? `&examId=${exam.id}` : ""}`;
    body = <MarksSheet user={user} examId={exam.id} streamId={stream.id} subjectId={subject.id} correctionRequested={sp(q, "correct") === "1"} selfHref={self} />;
  }

  return (
    <>
      {header}
      {tabs}
      <ScorePicker fields={fields} />
      {body}
    </>
  );
}
