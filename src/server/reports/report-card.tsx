import "server-only";
import React from "react";
import { prisma } from "@/lib/db";
import { Document, Page, Text, View, Image, Footer, Letterhead, loadBranding, renderPdf, s, C } from "./pdf-kit";
import { photoBuffers } from "./photos";
import { loadRule, loadScales } from "../exams/results";
import { buildCbcPages } from "./report-card-cbc";
import { fmtDate, ordinal, studentName } from "@/lib/utils";

export async function renderReportCards(examId: string, studentIds: string[], generatedBy: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { examType: true, term: { include: { academicYear: true } } } });
  const [b, school] = await Promise.all([loadBranding(), prisma.schoolSetting.findUnique({ where: { id: 1 } })]);
  const tpl = { showPhoto: true, showSubjectPositions: true, showStreamPosition: true, showClassPosition: true, showAttendance: true, showGradingKey: true, classTeacherLabel: "Class Teacher", dosLabel: "Director of Studies", headLabel: "Headteacher", ...((school?.reportTemplate as object) ?? {}) } as Record<string, any>;
  const results = await prisma.examResult.findMany({
    where: { examId, studentId: { in: studentIds } },
    include: {
      student: { include: { schoolClass: true, stream: { include: { classTeacher: true } }, combination: true, reportComments: { where: { examId } } } },
    },
    orderBy: [{ student: { stream: { name: "asc" } } }, { streamPosition: { sort: "asc", nulls: "last" } }],
  });
  const subjectResults = await prisma.subjectResult.findMany({ where: { examId, studentId: { in: studentIds } }, include: { subject: true }, orderBy: { subject: { name: "asc" } } });
  const maxBy = new Map((await prisma.examSubject.findMany({ where: { examId } })).map((e) => [`${e.classId}:${e.subjectId}`, Number(e.maxMarks)]));
  const att = await prisma.studentAttendance.groupBy({
    by: ["studentId", "status"], where: { studentId: { in: studentIds }, date: { gte: exam.term.startDate, lte: exam.term.endDate } }, _count: true,
  });
  const photos = tpl.showPhoto ? await photoBuffers(results.map((r) => r.student.photoFileId)) : new Map();
  const levels = [...new Set(results.map((r) => r.student.schoolClass.level))];
  const rules = Object.fromEntries(await Promise.all(levels.map(async (l) => [l, await loadRule(l)] as const)));
  const scales = Object.fromEntries(await Promise.all(levels.map(async (l) => [l, await loadScales(l)] as const)));

  // O-Level end-of-term reports use the competency-based layout (unless switched off in Settings).
  const cbcIds = tpl.cbcOLevel !== false && exam.examType.code === "EOT"
    ? results.filter((r) => r.student.schoolClass.level === "O_LEVEL").map((r) => r.studentId)
    : [];
  const cbcPages = school && cbcIds.length ? await buildCbcPages({ exam, b, school }, cbcIds) : new Map<string, React.ReactElement>();

  const cell = (w: string, extra: object = {}) => ({ width: w, padding: 3, fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: C.line, ...extra });
  const doc = (
    <Document title={`Report cards — ${exam.name}`} author={b.name}>
      {results.map((r) => {
        if (cbcPages.has(r.studentId)) return cbcPages.get(r.studentId)!;
        const st = r.student;
        const subs = subjectResults.filter((x) => x.studentId === r.studentId);
        const rule = rules[st.schoolClass.level];
        const comments = st.reportComments[0];
        const a = (k: string) => att.find((x) => x.studentId === r.studentId && x.status === k)?._count ?? 0;
        const photo = st.photoFileId ? photos.get(st.photoFileId) : undefined;
        const usePoints = rule.rankingBasis === "POINTS" || rule.rankingBasis === "AGGREGATE";
        return (
          <Page key={r.id} size="A4" style={s.page}>
            <Letterhead b={b} />
            <Text style={[s.title, { fontSize: 13 }]}>STUDENT REPORT CARD</Text>
            <Text style={[s.small, { textAlign: "center", marginBottom: 8 }]}>{exam.name} · {exam.term.name} {exam.term.academicYear.name}</Text>
            <View style={[s.row, { marginBottom: 8 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text><Text style={s.bold}>Name: </Text>{studentName(st)}</Text>
                <Text><Text style={s.bold}>Admission No: </Text>{st.admissionNo}</Text>
                <Text><Text style={s.bold}>Class: </Text>{st.schoolClass.name} {st.stream.name}{st.combination ? ` (${st.combination.code})` : ""}</Text>
                <Text><Text style={s.bold}>Sex: </Text>{st.gender === "MALE" ? "Male" : "Female"}   <Text style={s.bold}>Status: </Text>{st.residence === "DAY" ? "Day" : "Boarding"}</Text>
                <Text><Text style={s.bold}>Examination: </Text>{exam.examType.name}</Text>
              </View>
              {tpl.showPhoto && (
                <View style={{ width: 70, height: 84, borderWidth: 0.5, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
                  {photo ? <Image src={photo} style={{ width: 69, height: 83, objectFit: "cover" }} /> : <Text style={s.small}>Photo</Text>}
                </View>
              )}
            </View>
            <View style={s.row}>
              <Text style={[s.th, { width: "30%" }]}>SUBJECT</Text>
              <Text style={[s.th, { width: "12%", textAlign: "center" }]}>MARK</Text>
              <Text style={[s.th, { width: "10%", textAlign: "center" }]}>%</Text>
              <Text style={[s.th, { width: "9%", textAlign: "center" }]}>GRADE</Text>
              {usePoints && <Text style={[s.th, { width: "8%", textAlign: "center" }]}>PTS</Text>}
              {tpl.showSubjectPositions && <Text style={[s.th, { width: "10%", textAlign: "center" }]}>POS.</Text>}
              <Text style={[s.th, { flex: 1 }]}>REMARK</Text>
            </View>
            {subs.map((x, i) => {
              const max = maxBy.get(`${st.classId}:${x.subjectId}`) ?? 100;
              return (
                <View key={x.id} style={[s.row, { backgroundColor: i % 2 ? C.light : "white" }]}>
                  <Text style={cell("30%")}>{x.subject.name}</Text>
                  <Text style={cell("12%", { textAlign: "center" })}>{x.score !== null && !exam.isComposite ? `${Number(x.score)}/${max}` : x.status === "PRESENT" ? "" : x.status}</Text>
                  <Text style={cell("10%", { textAlign: "center" })}>{x.percentage !== null ? Number(x.percentage).toFixed(0) : "—"}</Text>
                  <Text style={cell("9%", { textAlign: "center", fontFamily: "Helvetica-Bold" })}>{x.grade ?? "—"}</Text>
                  {usePoints && <Text style={cell("8%", { textAlign: "center" })}>{x.points !== null ? Number(x.points) : ""}</Text>}
                  {tpl.showSubjectPositions && <Text style={cell("10%", { textAlign: "center" })}>{x.subjectPosition ? `${x.subjectPosition}/${x.subjectSize}` : "—"}</Text>}
                  <Text style={[cell("0%"), { flex: 1 }]}>{x.remark ?? ""}</Text>
                </View>
              );
            })}
            <View style={[s.row, { marginTop: 8, gap: 6, flexWrap: "wrap" }]}>
              {[
                ["Total marks", String(Number(r.total))],
                ["Average", `${Number(r.average).toFixed(1)}%`],
                ...(rule.rankingBasis === "AGGREGATE" ? [["Aggregate", r.aggregate === null ? "—" : String(r.aggregate)]] : usePoints ? [["Points", String(Number(r.points ?? 0))]] : []),
                ...(r.division ? [["Division", r.division]] : []),
                ...(tpl.showClassPosition ? [["Class position", r.classPosition ? `${ordinal(r.classPosition)} of ${r.classSize}` : "Not ranked"]] : []),
                ...(tpl.showStreamPosition ? [["Stream position", r.streamPosition ? `${ordinal(r.streamPosition)} of ${r.streamSize}` : "Not ranked"]] : []),
              ].map(([k, v]) => (
                <View key={k} style={{ borderWidth: 0.5, borderColor: C.blue, borderRadius: 3, padding: 4, minWidth: 80 }}>
                  <Text style={s.small}>{k}</Text><Text style={[s.bold, { fontSize: 10 }]}>{v}</Text>
                </View>
              ))}
            </View>
            {tpl.showAttendance && (
              <Text style={{ marginTop: 8 }}><Text style={s.bold}>Attendance this term: </Text>Present {a("PRESENT")} · Late {a("LATE")} · Absent {a("ABSENT")} · Excused {a("EXCUSED")}</Text>
            )}
            {comments?.conduct ? <Text style={{ marginTop: 3 }}><Text style={s.bold}>Conduct: </Text>{comments.conduct}</Text> : null}
            <View style={{ marginTop: 8, gap: 6 }}>
              {[
                [tpl.classTeacherLabel + (st.stream.classTeacher ? ` (${st.stream.classTeacher.firstName} ${st.stream.classTeacher.lastName})` : ""), comments?.classTeacherComment],
                [tpl.dosLabel, comments?.dosComment],
                [tpl.headLabel + (school?.headteacherName ? ` (${school.headteacherName})` : ""), comments?.headteacherComment],
              ].map(([label, text]) => (
                <View key={label as string} style={{ borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 4 }}>
                  <Text style={s.bold}>{label}&apos;s comment:</Text>
                  <Text style={{ minHeight: 14 }}>{text || " "}</Text>
                  <Text style={[s.small, { textAlign: "right" }]}>Signature: ____________________</Text>
                </View>
              ))}
            </View>
            <Text style={{ marginTop: 8 }}>
              <Text style={s.bold}>Term closes: </Text>{fmtDate(exam.term.endDate)}    <Text style={s.bold}>Next term begins: </Text>{fmtDate(exam.term.nextTermStart)}
            </Text>
            {tpl.showGradingKey && (
              <View style={{ marginTop: 8 }}>
                <Text style={[s.small, s.bold]}>Grading key</Text>
                {scales[st.schoolClass.level].map((sc, i) => (
                  <Text key={i} style={s.small}>
                    {sc.appliesTo !== "ALL" ? `${sc.appliesTo.toLowerCase()}: ` : ""}
                    {[...sc.bands].sort((x, y) => y.minScore - x.minScore).map((bd) => `${bd.grade} ${bd.minScore}–${Math.floor(bd.maxScore)}`).join(" · ")}
                  </Text>
                ))}
              </View>
            )}
            {b.footer ? <Text style={[s.small, { marginTop: 6, textAlign: "center", fontFamily: "Helvetica-Oblique" }]}>{b.footer}</Text> : null}
            <Footer by={generatedBy} pages={false} />
          </Page>
        );
      })}
    </Document>
  );
  return { buffer: await renderPdf(doc), count: results.length };
}
