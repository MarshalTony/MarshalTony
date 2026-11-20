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
  eot: { label: "Exam scores", short: "Examination", hint: "Marks for the term's examinations — beginning of term, mid-term or end of term (O-Level EOT out of 80). Saved marks go straight onto the report card." },
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
  const header = <PageHeader title="Enter scores" description={elevated ? "Choose what to enter, then the teacher, class, subject, term and year. The teacher you choose is printed as the subject teacher on the report card." : "Choose what to enter, then the class, subject, term and year. You only see the classes and subjects allocated to you."} />;
  if (!type) return <>{header}{tabs}</>;

  const years = await prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const pickedTerm = sp(q, "termId") ? await prisma.term.findUnique({ where: { id: sp(q, "termId")! } }) : null;
  const year = years.find((y) => y.id === sp(q, "yearId")) ?? years.find((y) => y.id === pickedTerm?.academicYearId) ?? years.find((y) => y.isCurrent) ?? years[0];
  const terms = year ? await prisma.term.findMany({ where: { academicYearId: year.id }, include: { academicYear: true }, orderBy: { startDate: "asc" } }) : [];
  const term = terms.find((t) => t.id === sp(q, "termId")) ?? terms.find((t) => t.isCurrent) ?? terms[terms.length - 1];
  if (!year || !term) return <>{header}{tabs}<Alert>Set up the academic year and terms first (Settings → Years & terms).</Alert></>;
  const oLevelOnly = type === "activity";

  // The admin / DOS first chooses the teacher; everyone then sees only that teacher's allocated classes and subjects,
  // so the subject teacher printed on the report card is the one the scores were entered for.
  const staffList = elevated ? await prisma.staff.findMany({ where: { status: "ACTIVE", isTeaching: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }) : [];
  const staff = elevated ? staffList.find((x) => x.id === sp(q, "staffId")) : null;
  const staffId = elevated ? staff?.id : user.staffId;
  const allocs = !staffId ? [] : await prisma.teacherAllocation.findMany({
    where: { staffId, academicYearId: year.id, ...(oLevelOnly ? { stream: { schoolClass: { level: "O_LEVEL" } } } : {}) },
    include: { subject: true, stream: { include: { schoolClass: true } } },
    orderBy: [{ stream: { schoolClass: { order: "asc" } } }, { stream: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const streams = [...new Map(allocs.map((a) => [a.streamId, a.stream])).values()];
  const stream = streams.find((s) => s.id === sp(q, "streamId"));
  const subjects = !stream ? [] : allocs.filter((a) => a.streamId === stream.id).map((a) => a.subject);
  const subject = subjects.find((s) => s.id === sp(q, "subjectId"));

  const fields: PickerField[] = [
    ...(elevated ? [{ name: "staffId", label: "Teacher (staff)", placeholder: "Select teacher", value: staff?.id, resets: ["streamId", "subjectId", "examId"], options: staffList.map((x) => ({ value: x.id, label: `${x.lastName} ${x.firstName}` })) }] : []),
    { name: "streamId", label: "Class", placeholder: elevated && !staff ? "Select a teacher first" : "Select class", value: stream?.id, resets: ["subjectId", "examId"], options: streams.map((x) => ({ value: x.id, label: `${x.schoolClass.name} ${x.name}` })) },
    { name: "subjectId", label: "Subject", placeholder: stream ? "Select subject" : "Select a class first", value: subject?.id, resets: ["examId"], options: subjects.map((x) => ({ value: x.id, label: x.name })) },
    { name: "termId", label: "Term", placeholder: "Select term", value: term.id, resets: ["examId"], options: terms.map((t) => ({ value: t.id, label: `${t.name}${t.isCurrent ? " (current)" : ""}` })) },
    { name: "yearId", label: "Year", placeholder: "Select year", value: year.id, resets: ["termId", "streamId", "subjectId", "examId"], options: years.map((y) => ({ value: y.id, label: `${y.name}${y.isCurrent ? " (current)" : ""}` })) },
  ];
  // Exam scores: any (non-combined) examination of this term that includes the class — the latest exam type first.
  const exams = type === "eot" && stream
    ? (await prisma.exam.findMany({ where: { termId: term.id, isComposite: false, classes: { some: { classId: stream.classId } } }, include: { examType: true }, orderBy: { createdAt: "desc" } }))
        .sort((a, b) => b.examType.order - a.examType.order)
    : [];
  const exam = exams.find((e) => e.id === sp(q, "examId")) ?? exams[0];
  if (exams.length) fields.push({
    name: "examId", label: "Examination", placeholder: "Select examination", value: exam?.id,
    options: exams.map((e) => ({ value: e.id, label: e.name })),
  });

  let body: React.ReactNode;
  if (elevated && !staff) {
    body = <Alert>Select the teacher you are entering {TYPES[type].label.toLowerCase()} for. Their name is printed as the subject teacher on the report card.</Alert>;
  } else if (streams.length === 0) {
    body = <Alert tone="warn">{elevated ? <>{staff!.lastName} {staff!.firstName} is not allocated to any {oLevelOnly ? "O-Level " : ""}class or subject for {year.name}. Allocate them under <Link className="underline" href={`/academics/allocations?staffId=${staff!.id}`}>Classes & Subjects → Teacher allocations</Link>.</> : `You have not been allocated any ${oLevelOnly ? "O-Level " : ""}class or subject for ${year.name}. Ask the system administrator to allocate you (Classes & Subjects → Teacher allocations).`}</Alert>;
  } else if (!stream) {
    body = <Alert>Select the class you want to enter {TYPES[type].label.toLowerCase()} for.</Alert>;
  } else if (!subject) {
    body = <Alert>Select the subject.</Alert>;
  } else if (type === "activity") {
    body = <ActivitySheet term={term} stream={{ id: stream.id, classId: stream.classId, label: `${stream.schoolClass.code} ${stream.name}` }} subject={subject} elevated={elevated} />;
  } else if (!exam) {
    body = <Alert tone="warn">There is no examination for {stream.schoolClass.name} in {term.name} {year.name} yet. The Director of Studies creates it under Examinations (and can add this class to an existing exam with Edit).</Alert>;
  } else {
    const self = `/scores?type=eot&yearId=${year.id}&termId=${term.id}${staff ? `&staffId=${staff.id}` : ""}&streamId=${stream.id}&subjectId=${subject.id}&examId=${exam.id}`;
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
