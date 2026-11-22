import "server-only";
import React from "react";
import { prisma } from "@/lib/db";
import { can, type CurrentUser } from "../auth";
import { reportScores } from "../exams/report-scores";
import { Document, Page, Text, View, Image, Footer, Letterhead, loadBranding, renderPdf, s, C } from "./pdf-kit";
import { photoBuffers } from "./photos";
import { fmtDate, ordinal, studentName } from "@/lib/utils";

const money = (n: number) => `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(n)}`;
const STATUS: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", EXCUSED: "Excused" };

/**
 * Full student profile (PDF): personal and school details, house and clubs, parents, health, subjects, class history,
 * results, attendance — and, for users allowed to see them, fees, discipline and medical records.
 */
export async function renderStudentProfile(id: string, user: CurrentUser) {
  const st = await prisma.student.findUnique({
    where: { id },
    include: {
      schoolClass: true, stream: { include: { classTeacher: true } }, combination: true, house: true, leavingRecord: true,
      clubs: { include: { club: true }, orderBy: { club: { name: "asc" } } },
      guardians: { include: { guardian: true }, orderBy: { isPrimary: "desc" } },
      enrollments: { include: { academicYear: true, schoolClass: true, stream: true }, orderBy: { academicYear: { startDate: "asc" } } },
      confirmations: { include: { term: { include: { academicYear: true } } }, orderBy: { term: { startDate: "desc" } }, take: 6 },
    },
  });
  if (!st) return null;
  const [year, term] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
  ]);
  const showFees = can(user, "fees.view"), showDiscipline = can(user, "discipline.manage"), showMedical = can(user, "welfare.confidential");
  const [subjects, results, attendance, ledger, discipline, medical, b] = await Promise.all([
    year ? prisma.studentSubject.findMany({ where: { studentId: id, academicYearId: year.id }, include: { subject: true }, orderBy: [{ subject: { reportOrder: "asc" } }, { subject: { name: "asc" } }] }) : [],
    prisma.examResult.findMany({ where: { studentId: id, exam: { isComposite: false } }, include: { exam: { include: { examType: true, term: { include: { academicYear: true } } } } } }),
    term ? prisma.studentAttendance.groupBy({ by: ["status"], where: { studentId: id, date: { gte: term.startDate, lte: term.endDate } }, _count: true }) : [],
    showFees ? prisma.ledgerEntry.findMany({ where: { studentId: id }, select: { debit: true, credit: true } }) : [],
    showDiscipline ? prisma.disciplineIncident.findMany({ where: { studentId: id }, orderBy: { date: "desc" }, take: 15 }) : [],
    showMedical ? prisma.medicalIncident.findMany({ where: { studentId: id }, orderBy: { date: "desc" }, take: 15 }) : [],
    loadBranding(),
  ]);
  results.sort((x, y) => y.exam.term.startDate.getTime() - x.exam.term.startDate.getTime() || y.exam.examType.order - x.exam.examType.order);
  const recent = results.slice(0, 8);
  const scores = await Promise.all(recent.map(async (r) => (await reportScores(r.examId, [id])).byStudent.get(id)));
  const photo = st.photoFileId ? (await photoBuffers([st.photoFileId], { maxPx: 400 })).get(st.photoFileId) : undefined;
  const billed = ledger.reduce((a, e) => a + Number(e.debit), 0), paid = ledger.reduce((a, e) => a + Number(e.credit), 0);
  const thisTerm = term ? st.confirmations.find((c) => c.termId === term.id) : undefined;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 10 }} wrap={false}>
      <Text style={[s.bold, { color: C.blue, fontSize: 10, borderBottomWidth: 1, borderBottomColor: C.blue, paddingBottom: 2, marginBottom: 4 }]}>{title}</Text>
      {children}
    </View>
  );
  /** Two label/value pairs per line. */
  const Pairs = ({ items }: { items: [string, string | null | undefined][] }) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ width: "50%", flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          <Text style={{ width: "42%", color: C.grey }}>{k}</Text><Text style={{ width: "58%", paddingRight: 6 }}>{v || "—"}</Text>
        </View>
      ))}
    </View>
  );
  const Table = ({ cols, rows, empty }: { cols: [string, number][]; rows: (string | number | null | undefined)[][]; empty: string }) => (
    rows.length === 0 ? <Text style={s.small}>{empty}</Text> : (
      <View>
        <View style={s.row}>{cols.map(([h, w]) => <Text key={h} style={[s.th, { width: w, flexShrink: 0 }]}>{h}</Text>)}</View>
        {rows.map((r, i) => (
          <View key={i} style={[s.row, { backgroundColor: i % 2 ? C.light : "white" }]}>
            {r.map((v, j) => <Text key={j} style={[s.td, { width: cols[j][1], flexShrink: 0 }]}>{v === null || v === undefined || v === "" ? "—" : String(v)}</Text>)}
          </View>
        ))}
      </View>
    )
  );
  const count = (k: string) => attendance.find((a) => a.status === k)?._count ?? 0;
  const attTotal = attendance.reduce((a, x) => a + x._count, 0);

  const doc = (
    <Document title={`Student profile — ${studentName(st)}`} author={b.name}>
      <Page size="A4" style={s.page}>
        <Letterhead b={b} />
        <Text style={[s.title, { fontSize: 13, marginBottom: 8 }]}>STUDENT PROFILE</Text>
        <View style={s.row}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[s.bold, { fontSize: 14 }]}>{studentName(st).toUpperCase()}</Text>
            <Text style={{ marginTop: 2, color: C.grey }}>{st.admissionNo} · {st.schoolClass.name} {st.stream.name}{st.combination ? ` (${st.combination.code})` : ""} · {st.residence === "DAY" ? "Day scholar" : "Boarder"} · {st.status.charAt(0) + st.status.slice(1).toLowerCase()}</Text>
            <View style={{ marginTop: 6 }}>
              <Pairs items={[
                ["Sex", st.gender === "MALE" ? "Male" : "Female"], ["Date of birth", fmtDate(st.dateOfBirth)],
                ["Nationality", st.nationality], ["Religion", st.religion],
                ["Home address", st.homeAddress], ["Admitted", fmtDate(st.admissionDate)],
                ["Previous school", st.previousSchool], ["LIN", st.linNumber],
                ["SchoolPay code", st.schoolPayCode], ["UNEB index no.", st.unebIndexNo],
              ]} />
            </View>
          </View>
          <View style={{ width: 96, height: 116, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            {photo ? <Image src={photo} style={{ width: 94, height: 114, objectFit: "cover" }} /> : <Text style={s.small}>No photo</Text>}
          </View>
        </View>

        <Section title="SCHOOL">
          <Pairs items={[
            ["Class / stream", `${st.schoolClass.name} ${st.stream.name}`], ["Class teacher", st.stream.classTeacher ? `${st.stream.classTeacher.lastName} ${st.stream.classTeacher.firstName}` : null],
            ["Combination", st.combination ? `${st.combination.code} — ${st.combination.name}` : null], ["Day / boarding", st.residence === "DAY" ? "Day scholar" : "Boarder"],
            ["House", st.house?.name], ["Clubs", st.clubs.map((m) => `${m.club.name}${m.role ? ` (${m.role})` : ""}`).join(", ")],
            ["Reported this term", term ? (thisTerm ? `Yes — ${fmtDate(thisTerm.confirmedAt)}` : "Not confirmed") : null], ["Portal account", st.userId ? "Yes" : "No"],
          ]} />
        </Section>

        <Section title="PARENTS / GUARDIANS">
          <Table
            cols={[["Name", 130], ["Relationship", 80], ["Phone", 110], ["Email", 120], ["Occupation", 99]]}
            rows={st.guardians.map((g) => [`${g.guardian.fullName}${g.isPrimary ? " (primary)" : ""}`, g.relationship, [g.guardian.phone, g.guardian.altPhone].filter(Boolean).join(" / "), g.guardian.email, g.guardian.occupation])}
            empty="No parent or guardian recorded."
          />
        </Section>

        <Section title="HEALTH & EMERGENCY">
          <Pairs items={[
            ["Emergency contact", st.emergencyContactName ? `${st.emergencyContactName}${st.emergencyContactPhone ? ` (${st.emergencyContactPhone})` : ""}` : null],
            ["Medical information", st.medicalInfo],
          ]} />
        </Section>

        <Section title={`SUBJECTS${year ? ` (${year.name})` : ""}`}>
          <Text>{subjects.length ? subjects.map((x) => x.subject.name).join(" · ") : "No subjects recorded for this year."}</Text>
        </Section>

        <Section title="CLASS HISTORY">
          <Table cols={[["Year", 90], ["Class", 200], ["Stream", 249]]} rows={st.enrollments.map((e) => [e.academicYear.name, e.schoolClass.name, e.stream.name])} empty="No enrolment records." />
        </Section>

        <Section title="RESULTS (latest examinations)">
          <Table
            cols={[["Examination", 190], ["Term", 85], ["Average", 60], ["Grade", 45], ["Class position", 80], ["Stream pos.", 79]]}
            rows={recent.map((r, i) => [
              r.exam.name, `${r.exam.term.name} ${r.exam.term.academicYear.name}`,
              scores[i]?.average != null ? `${scores[i]!.average!.toFixed(1)}%` : "—", scores[i]?.grade ?? "—",
              r.classPosition ? `${ordinal(r.classPosition)} of ${r.classSize}` : "—", r.streamPosition ? `${ordinal(r.streamPosition)} of ${r.streamSize}` : "—",
            ])}
            empty="No results yet."
          />
        </Section>

        <Section title={`ATTENDANCE${term ? ` — ${term.name} (${fmtDate(term.startDate)} to ${fmtDate(term.endDate)})` : ""}`}>
          <Text>{attTotal ? ["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((k) => `${STATUS[k]}: ${count(k)}`).join("   ·   ") + `   ·   Days recorded: ${attTotal}` : "No attendance recorded this term."}</Text>
        </Section>

        {showFees && (
          <Section title="FEES">
            <Pairs items={[["Total billed", money(billed)], ["Total paid / credited", money(paid)], ["Balance", billed - paid > 0 ? `${money(billed - paid)} owed` : billed - paid < 0 ? `${money(paid - billed)} in credit` : "Cleared"]]} />
          </Section>
        )}

        {showDiscipline && (
          <Section title="DISCIPLINE">
            <Table cols={[["Date", 70], ["Category", 90], ["Severity", 60], ["What happened", 200], ["Action taken", 119]]}
              rows={discipline.map((d) => [fmtDate(d.date), d.category, d.severity.toLowerCase(), d.description, d.actionTaken])} empty="No discipline incidents recorded." />
          </Section>
        )}

        {showMedical && (
          <Section title="SICK BAY / MEDICAL">
            <Table cols={[["Date", 70], ["Complaint", 170], ["Treatment", 170], ["Referred to", 129]]}
              rows={medical.map((m) => [fmtDate(m.date), m.complaint, m.treatment, m.referredTo])} empty="No medical visits recorded." />
          </Section>
        )}

        {st.leavingRecord && (
          <Section title="LEAVING">
            <Pairs items={[
              ["Left on", fmtDate(st.leavingRecord.leavingDate)], ["Reason", st.leavingRecord.reason.toLowerCase()], ["Last class", st.leavingRecord.lastClass],
              ["Conduct", st.leavingRecord.conduct], ["Destination school", st.leavingRecord.destinationSchool], ["Certificate no.", st.leavingRecord.certificateNo],
            ]} />
          </Section>
        )}
        <Text style={[s.small, { marginTop: 12, fontFamily: "Helvetica-Oblique" }]}>Confidential — for school use. Printed {fmtDate(new Date())}.</Text>
        <Footer by={`${user.fullName} (${user.username})`} />
      </Page>
    </Document>
  );
  return { buffer: await renderPdf(doc), student: st };
}
