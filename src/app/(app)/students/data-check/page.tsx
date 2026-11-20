import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { fixMissingEnrollments, fixMissingSubjects } from "@/server/actions/students";
import { isUgandanPhone, likelyDuplicates } from "@/lib/data-check";
import { aLevelProblems } from "@/lib/alevel";
import { ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, studentName } from "@/lib/utils";

export const metadata = { title: "Student data check" };

const LIMIT = 40;

/** Student data clean-up: problems that silently break mark sheets, report cards or messages, with fixes. */
export default async function DataCheckPage() {
  const user = await requirePage("students.view");
  const manage = can(user, "students.manage");
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (!year) return <Alert tone="warn">Set the current academic year first (Settings → Years & terms).</Alert>;
  const active = { status: "ACTIVE" as const };
  const pick = { id: true, admissionNo: true, firstName: true, lastName: true, otherNames: true, classId: true, dateOfBirth: true, schoolClass: { select: { code: true, name: true } }, stream: { select: { name: true } } };
  const [total, noSubjects, noEnrolment, noCombination, noGuardian, everyone, guardians, missingLin, missingPhoto, missingDob, missingPay] = await Promise.all([
    prisma.student.count({ where: active }),
    prisma.student.findMany({ where: { ...active, subjects: { none: { academicYearId: year.id } } }, select: pick, orderBy: [{ schoolClass: { order: "asc" } }, { lastName: "asc" }] }),
    prisma.student.count({ where: { ...active, enrollments: { none: { academicYearId: year.id } } } }),
    prisma.student.findMany({ where: { ...active, combinationId: null, schoolClass: { level: "A_LEVEL" } }, select: pick, orderBy: [{ schoolClass: { order: "asc" } }, { lastName: "asc" }] }),
    prisma.student.findMany({ where: { ...active, guardians: { none: {} } }, select: pick, orderBy: [{ schoolClass: { order: "asc" } }, { lastName: "asc" }] }),
    prisma.student.findMany({ where: active, select: pick }),
    prisma.guardian.findMany({ where: { students: { some: { student: active } } }, include: { students: { include: { student: { select: pick } }, take: 1 } } }),
    prisma.student.count({ where: { ...active, OR: [{ linNumber: null }, { linNumber: "" }] } }),
    prisma.student.count({ where: { ...active, photoFileId: null } }),
    prisma.student.count({ where: { ...active, dateOfBirth: null } }),
    prisma.student.count({ where: { ...active, OR: [{ schoolPayCode: null }, { schoolPayCode: "" }] } }),
  ]);
  const dups = likelyDuplicates(everyone);
  // S5–S6: 3 principal subjects + General Paper + either Sub-Maths or Sub-ICT.
  const aLevel = await prisma.student.findMany({
    where: { ...active, schoolClass: { level: "A_LEVEL" }, subjects: { some: { academicYearId: year.id } } },
    select: { ...pick, subjects: { where: { academicYearId: year.id }, select: { subject: { select: { code: true, name: true, category: true } } } } },
    orderBy: [{ schoolClass: { order: "asc" } }, { lastName: "asc" }],
  });
  const aLevelWrong = aLevel.map((s) => ({ s, problems: aLevelProblems(s.subjects.map((x) => x.subject), { complete: true }) })).filter((x) => x.problems.length);
  const badPhones = guardians.filter((g) => !isUgandanPhone(g.phone) || (g.altPhone && !isUgandanPhone(g.altPhone)));
  const issues = noSubjects.length + noEnrolment + noCombination.length + aLevelWrong.length + noGuardian.length + dups.length + badPhones.length;
  const who = (s: (typeof everyone)[number]) => (
    <><Link className="font-medium text-brand-800 hover:underline" href={`/students/${s.id}`}>{studentName(s)}</Link> <span className="font-mono text-xs text-slate-500">{s.admissionNo} · {s.schoolClass.code} {s.stream.name}</span></>
  );
  const more = (n: number) => (n > LIMIT ? <p className="mt-1 text-xs text-slate-500">…and {n - LIMIT} more.</p> : null);

  return (
    <>
      <PageHeader
        title="Student data check"
        description={`Problems in the records of the ${total.toLocaleString()} active students that can silently break mark sheets, report cards, fees messages or returns. Fix them here or follow the links.`}
        actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Issues to fix" value={issues} hint={issues ? "see below" : "all clear"} />
        <StatCard label="No LIN" value={missingLin} hint={<Link className="underline" href="/students?missing=lin">show</Link>} />
        <StatCard label="No photo" value={missingPhoto} hint={<Link className="underline" href="/students/photos">add photos</Link>} />
        <StatCard label="No date of birth / SchoolPay" value={`${missingDob} / ${missingPay}`} hint={<><Link className="underline" href="/students?missing=dob">DOB</Link> · <Link className="underline" href="/students?missing=schoolpay">SchoolPay</Link></>} />
      </div>
      {issues === 0 && <Alert tone="success" className="mb-5">No problems found in the student records.</Alert>}

      <div className="space-y-5">
        {noSubjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-red-800">No subjects for {year.name} ({noSubjects.length})</CardTitle>
              {manage && <ConfirmAction action={fixMissingSubjects} fields={{}} label="Give default subjects" variant="default" confirm={`Give ${noSubjects.length} student(s) their class's default subjects for ${year.name}? (O-Level: compulsory subjects; A-Level: their combination.)`} />}
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">These students do not appear on mark sheets or report cards. The fix gives O-Level students the compulsory subjects (add electives in <Link className="underline" href="/students/bulk">Bulk edit</Link>) and A-Level students their combination&apos;s subjects.</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{noSubjects.slice(0, LIMIT).map((s) => <li key={s.id}>{who(s)}</li>)}</ul>
              {more(noSubjects.length)}
            </CardContent>
          </Card>
        )}
        {noEnrolment > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-red-800">No enrolment record for {year.name} ({noEnrolment})</CardTitle>
              {manage && <ConfirmAction action={fixMissingEnrollments} fields={{}} label="Create enrolment records" variant="default" confirm={`Create ${year.name} enrolment records from each student's current class and stream?`} />}
            </CardHeader>
            <CardContent><p className="text-sm text-slate-600">Results, promotion and class history use the year&apos;s enrolment record. The fix records each student&apos;s current class and stream for {year.name}.</p></CardContent>
          </Card>
        )}
        {aLevelWrong.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-amber-800">S5–S6 subjects not matching the rule ({aLevelWrong.length})</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">Each A-Level student takes <b>3 principal subjects</b>, <b>General Paper</b>, and <b>either Sub-Maths or Sub-ICT</b>. Fix in <Link className="underline" href="/students/bulk">Bulk edit</Link> (choosing the combination ticks the right subjects) or on the student&apos;s profile.</p>
              <Table>
                <THead><tr><TH>Student</TH><TH>Problem</TH></tr></THead>
                <tbody>{aLevelWrong.slice(0, LIMIT).map(({ s, problems }) => <TR key={s.id}><TD>{who(s)}</TD><TD className="text-xs">{problems.join("; ")}</TD></TR>)}</tbody>
              </Table>
              {more(aLevelWrong.length)}
            </CardContent>
          </Card>
        )}
        {noCombination.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-amber-800">A-Level students without a combination ({noCombination.length})</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">Set the combination in <Link className="underline" href="/students/bulk">Bulk edit</Link> (choose the class) — it also ticks the combination&apos;s subjects.</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{noCombination.slice(0, LIMIT).map((s) => <li key={s.id}>{who(s)}</li>)}</ul>
              {more(noCombination.length)}
            </CardContent>
          </Card>
        )}
        {dups.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-amber-800">Possible duplicate students ({dups.length})</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">Same names and the same date of birth — or the same class where a date of birth is missing. If two records are the same learner, keep one and delete the other (a record with marks or fees cannot be deleted — mark it Withdrawn instead).</p>
              <Table>
                <THead><tr><TH>Students</TH><TH>Date of birth</TH></tr></THead>
                <tbody>{dups.slice(0, LIMIT).map((g, i) => (
                  <TR key={i}>
                    <TD><ul className="space-y-0.5">{g.map((s) => <li key={s.id}>{who(s)}</li>)}</ul></TD>
                    <TD className="text-xs">{g.map((s) => (s.dateOfBirth ? fmtDate(s.dateOfBirth) : "—")).join(" / ")}</TD>
                  </TR>
                ))}</tbody>
              </Table>
              {more(dups.length)}
            </CardContent>
          </Card>
        )}
        {noGuardian.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-amber-800">No parent or guardian ({noGuardian.length})</CardTitle><Button asChild size="sm" variant="outline"><Link href="/students?missing=guardian">Open list</Link></Button></CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">No one receives fees reminders, results SMS or portal access for these students. Add a parent on the student&apos;s profile.</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{noGuardian.slice(0, LIMIT).map((s) => <li key={s.id}>{who(s)}</li>)}</ul>
              {more(noGuardian.length)}
            </CardContent>
          </Card>
        )}
        {badPhones.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-amber-800">Parent phone numbers that do not look Ugandan ({badPhones.length})</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-slate-600">Expected 07XX XXX XXX or +256 7XX XXX XXX (landlines 03/04…). SMS cannot reach a wrong number — correct it on the student&apos;s profile (Parents & guardians).</p>
              <Table>
                <THead><tr><TH>Parent / guardian</TH><TH>Phone</TH><TH>Child</TH></tr></THead>
                <tbody>{badPhones.slice(0, LIMIT).map((g) => (
                  <TR key={g.id}>
                    <TD className="font-medium">{g.fullName}</TD>
                    <TD className="font-mono text-xs text-red-700">{[g.phone, g.altPhone].filter(Boolean).join(" / ")}</TD>
                    <TD>{g.students[0] ? who(g.students[0].student) : "—"}</TD>
                  </TR>
                ))}</tbody>
              </Table>
              {more(badPhones.length)}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
