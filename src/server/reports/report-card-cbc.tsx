import "server-only";
import React from "react";
import { prisma } from "@/lib/db";
import { Page, Text, View, Image, type Branding } from "./pdf-kit";
import { activityAverage, bandFor, DEFAULT_ACTIVITY_BANDS, summaryRow, type Band } from "@/lib/cbc";
import { gradeFor } from "@/lib/exams/engine";

/**
 * Competency-based (lower secondary) end-of-term report, laid out like the school's
 * existing card: page 1 = Activities of Integration, page 2 = end-of-term summary.
 */
const ink = "#000000";
const t = {
  page: { paddingTop: 26, paddingBottom: 26, paddingHorizontal: 30, fontSize: 9, fontFamily: "Helvetica", color: ink },
  b: { fontFamily: "Helvetica-Bold" },
  cell: { borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: ink, padding: 3, justifyContent: "center" as const },
  row: { flexDirection: "row" as const },
  table: { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: ink },
};

type Ctx = {
  exam: { id: string; termId: string; term: { number: number; endDate: Date; nextTermStart: Date | null; academicYearId: string; academicYear: { name: string } } };
  b: Branding;
  school: { name: string; poBox: string | null; address: string | null; phone: string | null; altPhone: string | null; website: string | null; email: string | null; altEmail: string | null; motto: string | null; reportFooter: string | null };
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const classLabel = (code: string, stream: string) => `${code.replace(/^S(\d)$/, "S.$1")} ${stream}`;

export async function buildCbcPages(ctx: Ctx, studentIds: string[]) {
  const { exam } = ctx;
  if (!studentIds.length) return new Map<string, React.ReactElement>();
  const yearId = exam.term.academicYearId;
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      schoolClass: true, stream: true,
      enrollments: { where: { academicYearId: yearId }, include: { schoolClass: true, stream: true } },
      subjects: { where: { academicYearId: yearId }, include: { subject: true } },
      activityScores: { where: { activity: { termId: exam.termId } } },
      competencyRemarks: { where: { termId: exam.termId } },
      reportComments: { where: { examId: exam.id } },
      subjectResults: { where: { examId: exam.id } },
    },
  });
  const classIds = [...new Set(students.map((s) => s.enrollments[0]?.classId ?? s.classId))];
  const [activities, allocations, oScale, actScale] = await Promise.all([
    prisma.learningActivity.findMany({ where: { termId: exam.termId, classId: { in: classIds } }, orderBy: { order: "asc" } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: yearId }, include: { staff: true } }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ALL", isDefault: true }, include: { bands: true } }),
    prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ACTIVITY", isDefault: true }, include: { bands: true } }),
  ]);
  const gradeBands = (oScale?.bands ?? []).map((x) => ({ grade: x.grade, minScore: Number(x.minScore), maxScore: Number(x.maxScore), points: Number(x.points), remark: x.remark, description: x.description }));
  const idBands: Band[] = actScale ? actScale.bands.map((x) => ({ grade: x.grade, minScore: Number(x.minScore), maxScore: Number(x.maxScore), remark: x.remark, description: x.description })) : DEFAULT_ACTIVITY_BANDS;
  const { b, school } = ctx;
  // Local format as printed on the school's card: +256 772 314 931 → 0772314931
  const local = (p: string) => p.replace(/\s/g, "").replace(/^\+?256/, "0");
  const phones = [school.phone, school.altPhone].filter(Boolean).map((p) => local(p!)).join("/");
  const range = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  const emails = [school.email, school.altEmail].filter(Boolean).join("/");

  const pages = new Map<string, React.ReactElement>();
  for (const st of students) {
    const enr = st.enrollments[0];
    const classId = enr?.classId ?? st.classId;
    const streamId = enr?.streamId ?? st.streamId;
    const cls = enr?.schoolClass ?? st.schoolClass;
    const stream = enr?.stream ?? st.stream;
    const taken = new Map(st.subjects.map((x) => [x.subjectId, x.subject]));
    const acts = activities.filter((a) => a.classId === classId && taken.has(a.subjectId));
    const scoreOf = new Map(st.activityScores.map((x) => [x.activityId, Number(x.score)]));
    const subjectIds = [...new Set([...st.subjectResults.map((r) => r.subjectId), ...acts.map((a) => a.subjectId)])].filter((id) => taken.has(id));
    const subjects = subjectIds.map((id) => taken.get(id)!).sort((x, y) => x.name.localeCompare(y.name));
    const teacher = (subjectId: string) => {
      const a = allocations.find((x) => x.subjectId === subjectId && x.streamId === streamId);
      return a ? `${a.staff.lastName} ${a.staff.firstName}`.toUpperCase() : "";
    };
    const comment = st.reportComments[0];
    const name = [st.lastName, st.firstName, st.otherNames].filter(Boolean).join(" ").toUpperCase();

    const aoiRows = subjects.filter((sub) => acts.some((a) => a.subjectId === sub.id)).map((sub) => {
      const list = acts.filter((a) => a.subjectId === sub.id);
      const scores = list.map((a) => scoreOf.get(a.id) ?? null);
      const avg = activityAverage(scores);
      const band = bandFor(avg, idBands);
      const remark = st.competencyRemarks.find((r) => r.subjectId === sub.id)?.remark ?? "";
      return { sub, list, scores, avg, band, remark };
    });
    const summary = subjects.map((sub) => {
      const sr = st.subjectResults.find((r) => r.subjectId === sub.id);
      const hasActivities = acts.some((a) => a.subjectId === sub.id);
      const avg = activityAverage(acts.filter((a) => a.subjectId === sub.id).map((a) => scoreOf.get(a.id) ?? null));
      const row = summaryRow({ hasActivities, activityAvg: avg, eotScore: sr?.percentage != null ? Number(sr.percentage) : null, eotMax: 100 });
      return { sub, ...row, grade: row.total === null ? "" : gradeFor(row.total, gradeBands)?.grade ?? "" };
    });

    const C = (w: string | number, children: React.ReactNode, extra: Record<string, unknown> = {}) => (
      <View style={[t.cell, { width: w }, extra as object] as any}><Text>{children}</Text></View>
    );

    pages.set(st.id, (
      <React.Fragment key={st.id}>
        <Page size="A4" style={t.page}>
          {/* Letterhead */}
          <View style={[t.row, { borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: ink, paddingTop: 6 }]}>
            <View style={{ width: 95, alignItems: "center", justifyContent: "flex-start", paddingTop: 10 }}>
              {b.logo ? <Image src={b.logo} style={{ width: 85, height: 85, objectFit: "contain" }} /> : null}
            </View>
            <View style={{ flex: 1, alignItems: "center", paddingRight: 30 }}>
              <Text style={[t.b, { fontSize: 15, marginBottom: 6 }]}>{school.name.toUpperCase()}</Text>
              {school.poBox || school.address ? <Text style={[t.b, { fontSize: 11 }]}>Address: {(school.poBox || school.address)!.toUpperCase()}</Text> : null}
              {phones ? <Text style={[t.b, { fontSize: 11 }]}>TEL:{phones}.</Text> : null}
              {school.website ? <Text style={[t.b, { fontSize: 11 }]}>Website: {school.website}</Text> : null}
              {emails ? <Text style={[t.b, { fontSize: 11 }]}>Email: {emails}</Text> : null}
              {school.motto ? <Text style={{ fontSize: 8, marginTop: 3 }}>&quot;{school.motto.toUpperCase()}&quot;</Text> : null}
            </View>
          </View>
          <View style={{ borderLeftWidth: 0.6, borderColor: ink, paddingTop: 8, paddingBottom: 6, alignItems: "center" }}>
            <Text style={[t.b, { fontSize: 12 }]}>STUDENT&apos;S ACADEMIC REPORT TERM {exam.term.number} {exam.term.academicYear.name}</Text>
            <Text style={{ fontSize: 11, marginTop: 6 }}>
              <Text style={t.b}>Term: </Text>{exam.term.number}  <Text style={t.b}>Class: </Text>  {classLabel(cls.code, stream.name)}          <Text style={t.b}>Gender: </Text>  {st.gender === "MALE" ? "Male" : "Female"}       <Text style={t.b}>Year: </Text>  {exam.term.academicYear.name}
            </Text>
          </View>

          {/* Student details */}
          <View style={[t.table, { marginTop: 6 }]}>
            <View style={t.row}>{C("22%", "Student Name", t.b)}{C("40%", name)}{C("17%", "Reg Number", t.b)}{C("21%", st.admissionNo.replace(/\//g, ""))}</View>
            <View style={t.row}>{C("22%", "SchoolPay Code", t.b)}{C("40%", st.schoolPayCode ?? "0")}{C("17%", "LIN Number", t.b)}{C("21%", st.linNumber ?? "")}</View>
          </View>

          {/* Activities of Integration */}
          <View style={[t.table, { marginTop: 6 }]}>
            <View style={t.row}>
              {C("18%", "SUBJECT", t.b)}{C("18%", "Chapter/Theme", t.b)}{C("6%", "Score", t.b)}{C("5%", "AVG", t.b)}{C("4%", "IDF", t.b)}
              {C("12%", "Descriptor", t.b)}{C("19%", "Remark Competency", t.b)}{C("18%", "Teacher", t.b)}
            </View>
            {aoiRows.map((r) => (
              <View key={r.sub.id} style={t.row} wrap={false}>
                {C("18%", r.sub.name)}
                <View style={[t.cell, { width: "18%" }]}>{r.list.map((a, i) => <Text key={a.id}>{i + 1}.{a.title}</Text>)}</View>
                <View style={[t.cell, { width: "6%", alignItems: "center" }]}>{r.scores.map((x, i) => <Text key={i}>{x ?? ""}</Text>)}</View>
                {C("5%", r.avg ?? "", { alignItems: "center" })}
                {C("4%", r.band?.grade ?? "", { alignItems: "center" })}
                {C("12%", r.band?.remark ?? "", { alignItems: "center" })}
                {C("19%", r.remark, { alignItems: "center", textAlign: "center" })}
                {C("18%", teacher(r.sub.id), { alignItems: "center", textAlign: "center" })}
              </View>
            ))}
            {aoiRows.length === 0 && <View style={t.row}>{C("100%", "No activities of integration were recorded this term.")}</View>}
          </View>

          {/* Identifiers key */}
          <View style={[t.table, { marginTop: 14 }]} wrap={false}>
            <View style={t.row}>{C("17%", "Identifiers", t.b)}{C("20%", "Score Range", t.b)}{C("63%", "Descriptor", t.b)}</View>
            {[...idBands].sort((x, y) => y.minScore - x.minScore).map((bd) => (
              <View key={bd.grade} style={t.row}>
                {C("17%", bd.grade)}{C("20%", `${range(bd.minScore)}-${range(bd.maxScore)}`)}
                <View style={[t.cell, { width: "63%" }]}><Text><Text style={t.b}>{bd.remark}({bd.remark.charAt(0)}): </Text>{bd.description ?? ""}</Text></View>
              </View>
            ))}
            <View style={t.row}>{C("100%", "LO= Learning Outcomes", { alignItems: "center" })}</View>
          </View>
        </Page>

        <Page size="A4" style={t.page}>
          <Text style={[t.b, { fontSize: 14, textAlign: "center", textDecoration: "underline", marginBottom: 14 }]}>Summary of End of Term Performance, {exam.term.academicYear.name}</Text>
          <View style={t.table}>
            <View style={t.row}>{C("52%", "SUBJECT", t.b)}{C("11%", "Out of 20", t.b)}{C("9%", "EOT/80", t.b)}{C("16%", "TOTAL(100%)", t.b)}{C("12%", "GRADE", t.b)}</View>
            {summary.map((r) => (
              <View key={r.sub.id} style={t.row} wrap={false}>
                {C("52%", r.sub.name)}{C("11%", r.out20 ?? "")}{C("9%", r.eot80 ?? "")}{C("16%", r.total ?? "")}{C("12%", r.grade)}
              </View>
            ))}
          </View>

          <Text style={[t.b, { marginTop: 10, marginBottom: 8 }]}>GRADING SCALE</Text>
          <View style={t.table} wrap={false}>
            <View style={t.row}>{C("7%", "GRADE", t.b)}{C("11%", "SCORE RANGE", t.b)}{C("17%", "ACHIEVEMENT LEVEL", t.b)}{C("65%", "DESCRIPTOR", t.b)}</View>
            {[...gradeBands].sort((x, y) => y.minScore - x.minScore).map((bd) => (
              <View key={bd.grade} style={t.row}>
                {C("7%", bd.grade, { alignItems: "center" })}
                {C("11%", `${bd.minScore}-${Math.floor(bd.maxScore)}`)}
                {C("17%", bd.remark.toUpperCase(), t.b)}
                {C("65%", bd.description ?? "")}
              </View>
            ))}
          </View>

          {/* Comments */}
          <View style={[t.row, { marginTop: 22, borderWidth: 0.4, borderColor: "#d0d0d0" }]} wrap={false}>
            {[["Class Teacher's Comment:", comment?.classTeacherComment], ["Head Teacher's Comment:", comment?.headteacherComment]].map(([label, text], i) => (
              <View key={i} style={{ width: "50%", padding: 8, borderLeftWidth: i ? 0.4 : 0, borderColor: "#d0d0d0" }}>
                <Text style={[t.b, { textAlign: "center", marginBottom: 8 }]}>{label}</Text>
                <Text style={{ textAlign: "center", minHeight: 14, marginBottom: 10 }}>{text ?? ""}</Text>
                <Text>Signature:.........................................</Text>
              </View>
            ))}
          </View>

          <Text style={{ marginTop: 22, textAlign: "center" }}>
            <Text style={t.b}>This Term has ended On </Text><Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{iso(exam.term.endDate)}</Text>
            <Text style={t.b}> Next Term Begins On </Text><Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{iso(exam.term.nextTermStart)}</Text>
          </Text>
          {school.reportFooter ? <Text style={{ marginTop: 12, textAlign: "center", color: "#d40000", fontFamily: "Helvetica-Oblique" }}>{school.reportFooter}</Text> : null}
        </Page>
      </React.Fragment>
    ));
  }
  return pages;
}
