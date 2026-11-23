import "server-only";
import React from "react";
import { prisma } from "@/lib/db";
import { reportScores } from "../exams/report-scores";
import { ensureFreshResults } from "../exams/approval";
import { Document, Page, Text, View, Footer, Letterhead, loadBranding, renderPdf, s, C } from "./pdf-kit";
import { initialsOf, positions, subjectStats, type SubjectStats } from "@/lib/scoresheet";
import { studentName } from "@/lib/utils";

export type ScoreRow = {
  studentId: string; admissionNo: string; name: string; sex: string; stream: string;
  cells: Map<string, { score: number | null; grade: string | null }>;
  count: number; total: number | null; average: number | null; grade: string | null; points: number | null;
  classPos: number | null; streamPos: number | null;
};
export type ScoreSheet = {
  title: string; subtitle: string; basis: string; mode: "cbc" | "exam"; aLevel: boolean; wholeClass: boolean;
  subjects: { id: string; code: string; name: string; teachers: string }[];
  rows: ScoreRow[]; stats: Map<string, SubjectStats>; gradeOrder: string[]; classSize: number;
};

const O_GRADES = ["A", "B", "C", "D", "E"];
const A_GRADES = ["A", "B", "C", "D", "E", "O", "F"];

/**
 * Score sheet for one exam × class (optionally one stream): every learner's subject scores as the report card shows them
 * (S1–S4 competency card: activities /20 + exam /80 = total /100; otherwise the exam percentage; A-Level grades and points
 * from the papers), with total, average, grade/points, class and stream positions, and subject statistics.
 */
export async function loadScoreSheet(examId: string, classId: string, streamId: string | null, sort: "position" | "name"): Promise<ScoreSheet> {
  await ensureFreshResults(examId);
  const [exam, cls, results, examSubjects] = await Promise.all([
    prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { examType: true, term: { include: { academicYear: true } } } }),
    prisma.schoolClass.findUniqueOrThrow({ where: { id: classId }, include: { streams: true } }),
    prisma.examResult.findMany({ where: { examId, classId }, include: { student: true } }),
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true }, orderBy: [{ subject: { reportOrder: "asc" } }, { subject: { name: "asc" } }] }),
  ]);
  const aLevel = cls.level === "A_LEVEL";
  const streamName = new Map(cls.streams.map((x) => [x.id, x.name]));
  const [scores, subjectResults, allocations] = await Promise.all([
    reportScores(examId, results.map((r) => r.studentId)),
    prisma.subjectResult.findMany({ where: { examId, studentId: { in: results.map((r) => r.studentId) } } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: exam.term.academicYearId, stream: { classId }, ...(streamId ? { streamId } : {}) }, include: { staff: true } }),
  ]);
  const cbc = scores.mode === "cbc" && !aLevel;
  const sr = new Map(subjectResults.map((x) => [`${x.studentId}:${x.subjectId}`, x]));

  // Every learner of the class (positions are within the class even when one stream is printed).
  const all: ScoreRow[] = results.map((r) => {
    const sc = scores.byStudent.get(r.studentId);
    const cells = new Map<string, { score: number | null; grade: string | null }>();
    for (const es of examSubjects) {
      if (cbc) {
        const x = sc?.subjects.find((y) => y.subjectId === es.subjectId);
        if (x) cells.set(es.subjectId, { score: Math.round(x.score), grade: x.grade });
      } else {
        const x = sr.get(`${r.studentId}:${es.subjectId}`);
        if (x) cells.set(es.subjectId, { score: x.percentage === null ? null : Math.round(Number(x.percentage)), grade: x.grade });
      }
    }
    const vals = [...cells.values()].filter((c) => c.score !== null).map((c) => c.score!);
    return {
      studentId: r.studentId, admissionNo: r.student.admissionNo, name: studentName(r.student), sex: r.student.gender === "MALE" ? "M" : "F",
      stream: streamName.get(r.streamId) ?? "", cells, count: vals.length,
      total: vals.length ? vals.reduce((a, b) => a + b, 0) : null,
      average: cbc ? sc?.average ?? null : vals.length ? Number(r.average) : null,
      grade: cbc ? sc?.grade ?? null : null,
      points: aLevel ? Number(r.points ?? 0) : null,
      classPos: null, streamPos: null,
      ...(aLevel ? { classPos: r.classPosition, streamPos: r.streamPosition } : {}),
    };
  });
  // O-Level: positions by the average across all subjects (as the analysis and report-card comments use).
  if (!aLevel) {
    const cp = positions(new Map(all.map((x) => [x.studentId, x.average])));
    for (const x of all) x.classPos = cp.get(x.studentId) ?? null;
    for (const st of cls.streams) {
      const ids = new Set(results.filter((r) => r.streamId === st.id).map((r) => r.studentId));
      const sp = positions(new Map(all.filter((x) => ids.has(x.studentId)).map((x) => [x.studentId, x.average])));
      for (const x of all) if (ids.has(x.studentId)) x.streamPos = sp.get(x.studentId) ?? null;
    }
  }
  const inStream = streamId ? new Set(results.filter((r) => r.streamId === streamId).map((r) => r.studentId)) : null;
  const rows = all.filter((x) => !inStream || inStream.has(x.studentId));
  const byPos = (x: ScoreRow) => (streamId ? x.streamPos : x.classPos) ?? 1e9;
  rows.sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => byPos(a) - byPos(b) || a.name.localeCompare(b.name));

  const subjects = examSubjects
    .filter((es) => rows.some((r) => r.cells.has(es.subjectId)))
    .map((es) => ({
      id: es.subjectId, code: es.subject.shortName || es.subject.code, name: es.subject.name,
      teachers: [...new Set(allocations.filter((a) => a.subjectId === es.subjectId).map((a) => initialsOf(a.staff.lastName, a.staff.firstName)))].join("/"),
    }));
  const gradeOrder = aLevel ? A_GRADES : O_GRADES;
  const stats = new Map(subjects.map((sub) => [sub.id, subjectStats(rows.map((r) => r.cells.get(sub.id) ?? { score: null, grade: null }), gradeOrder)]));
  const where = streamId ? `${cls.name} ${streamName.get(streamId) ?? ""}` : cls.name;
  return {
    title: `SCORE SHEET — ${where.toUpperCase()}`,
    subtitle: `${exam.name} · ${exam.term.name} ${exam.term.academicYear.name}`,
    basis: cbc ? "Subject score = Activities of Integration /20 + exam /80 (as on the report card). Positions by average across all subjects."
      : aLevel ? "Subject score = exam % (mean of the papers); grade A–F from the paper grades. Positions by total points."
      : "Subject score = exam %. Positions by average across all subjects.",
    mode: cbc ? "cbc" : "exam", aLevel, wholeClass: !streamId,
    subjects, rows, stats, gradeOrder, classSize: all.length,
  };
}

/** Landscape PDF (A3 when there are many subjects), header repeated on every page, subject statistics at the foot. */
export async function renderScoreSheetPdf(sheet: ScoreSheet, generatedBy: string) {
  const b = await loadBranding();
  const n = sheet.subjects.length;
  const size = n > 13 ? "A3" : "A4";
  const pageW = (size === "A3" ? 1190.55 : 841.89) - 56;
  const fixedW = { no: 18, adm: 62, name: 120, sex: 18, stream: sheet.wholeClass ? 34 : 0 };
  const tailW = { count: 22, total: 32, avg: 32, grade: sheet.aLevel ? 30 : 26, cpos: 30, spos: 30 };
  const used = Object.values(fixedW).reduce((a, x) => a + x, 0) + Object.values(tailW).reduce((a, x) => a + x, 0);
  const subW = Math.max(24, Math.min(46, (pageW - used) / Math.max(1, n)));
  const fs = size === "A3" ? 7.5 : n > 10 ? 6.5 : 7;
  const cell = (w: number, extra: object = {}) => ({ width: w, flexShrink: 0, paddingVertical: 2, paddingHorizontal: 1.5, fontSize: fs, borderRightWidth: 0.4, borderRightColor: C.line, ...extra });
  const head = (w: number, t: string, extra: object = {}) => <Text style={[s.th, cell(w, { textAlign: "center", fontSize: fs, ...extra })]}>{t}</Text>;
  const tint = (g: string | null) => (g === "A" ? "#dcfce7" : g === "E" || g === "F" ? "#fee2e2" : undefined);
  const statRow = (label: string, f: (st: SubjectStats) => string, bold = false) => (
    <View style={[s.row, { borderBottomWidth: 0.4, borderBottomColor: C.line }]} wrap={false}>
      <Text style={cell(fixedW.no + fixedW.adm + fixedW.name + fixedW.sex + fixedW.stream, { textAlign: "right", fontFamily: "Helvetica-Bold" })}>{label}</Text>
      {sheet.subjects.map((sub) => <Text key={sub.id} style={cell(subW, { textAlign: "center", ...(bold ? { fontFamily: "Helvetica-Bold" } : {}) })}>{f(sheet.stats.get(sub.id)!)}</Text>)}
    </View>
  );
  const doc = (
    <Document title={sheet.title} author={b.name}>
      <Page size={size} orientation="landscape" style={[s.page, { padding: 28 }]}>
        <Letterhead b={b} />
        <Text style={[s.title, { fontSize: 12 }]}>{sheet.title}</Text>
        <Text style={[s.small, { textAlign: "center" }]}>{sheet.subtitle} · {sheet.rows.length} learner{sheet.rows.length === 1 ? "" : "s"}</Text>
        <Text style={[s.small, { textAlign: "center", marginBottom: 6, fontFamily: "Helvetica-Oblique" }]}>{sheet.basis}</Text>
        <View style={s.row} fixed>
          {head(fixedW.no, "#")}{head(fixedW.adm, "Adm. No.")}{head(fixedW.name, "Name", { textAlign: "left" })}{head(fixedW.sex, "Sex")}
          {sheet.wholeClass && head(fixedW.stream, "Str.")}
          {sheet.subjects.map((sub) => <React.Fragment key={sub.id}>{head(subW, sub.code)}</React.Fragment>)}
          {head(tailW.count, "No.")}{head(tailW.total, "Total")}{head(tailW.avg, "Avg")}{head(tailW.grade, sheet.aLevel ? "Points" : "Grade")}
          {head(tailW.cpos, "Class")}{head(tailW.spos, "Stream")}
        </View>
        {sheet.rows.map((r, i) => (
          <View key={r.studentId} style={[s.row, { backgroundColor: i % 2 ? C.light : "white", borderBottomWidth: 0.4, borderBottomColor: C.line }]} wrap={false}>
            <Text style={cell(fixedW.no, { textAlign: "right" })}>{i + 1}</Text>
            <Text style={cell(fixedW.adm)}>{r.admissionNo}</Text>
            <Text style={cell(fixedW.name)}>{r.name}</Text>
            <Text style={cell(fixedW.sex, { textAlign: "center" })}>{r.sex}</Text>
            {sheet.wholeClass && <Text style={cell(fixedW.stream, { textAlign: "center" })}>{r.stream}</Text>}
            {sheet.subjects.map((sub) => {
              const c = r.cells.get(sub.id);
              return <Text key={sub.id} style={cell(subW, { textAlign: "center", backgroundColor: tint(c?.grade ?? null) })}>{!c ? "" : c.score === null ? (c.grade ?? "—") : `${c.score}${c.grade ? ` ${c.grade}` : ""}`}</Text>;
            })}
            <Text style={cell(tailW.count, { textAlign: "center" })}>{r.count || ""}</Text>
            <Text style={cell(tailW.total, { textAlign: "center" })}>{r.total ?? ""}</Text>
            <Text style={cell(tailW.avg, { textAlign: "center", fontFamily: "Helvetica-Bold" })}>{r.average === null ? "" : r.average.toFixed(1)}</Text>
            <Text style={cell(tailW.grade, { textAlign: "center", fontFamily: "Helvetica-Bold" })}>{sheet.aLevel ? (r.points ?? "") : (r.grade ?? "")}</Text>
            <Text style={cell(tailW.cpos, { textAlign: "center" })}>{r.classPos ?? "—"}</Text>
            <Text style={cell(tailW.spos, { textAlign: "center" })}>{r.streamPos ?? "—"}</Text>
          </View>
        ))}
        {sheet.rows.length === 0 && <Text style={[s.td, { textAlign: "center" }]}>No results yet for this class.</Text>}
        {sheet.rows.length > 0 && (
          <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: C.dark }} wrap={false}>
            {statRow("Candidates", (st) => String(st.candidates))}
            {statRow("Subject average", (st) => (st.mean === null ? "—" : st.mean.toFixed(1)), true)}
            {statRow("Highest", (st) => (st.highest === null ? "—" : String(st.highest)))}
            {statRow("Lowest", (st) => (st.lowest === null ? "—" : String(st.lowest)))}
            {sheet.gradeOrder.map((g) => <React.Fragment key={g}>{statRow(`Grade ${g}`, (st) => String(st.grades[g] ?? 0))}</React.Fragment>)}
            <View style={s.row}>
              <Text style={cell(fixedW.no + fixedW.adm + fixedW.name + fixedW.sex + fixedW.stream, { textAlign: "right", fontFamily: "Helvetica-Bold" })}>Subject teacher</Text>
              {sheet.subjects.map((sub) => <Text key={sub.id} style={cell(subW, { textAlign: "center" })}>{sub.teachers}</Text>)}
            </View>
          </View>
        )}
        <Text style={[s.small, { marginTop: 8 }]}>Key: {sheet.subjects.map((sub) => `${sub.code} = ${sub.name}`).join(" · ")}</Text>
        <View style={[s.row, { marginTop: 18, justifyContent: "space-between" }]} wrap={false}>
          {["Class teacher", "Director of Studies", "Headteacher"].map((l) => (
            <View key={l} style={{ width: "28%", borderTopWidth: 0.6, borderTopColor: C.dark, paddingTop: 2 }}><Text style={s.small}>{l} — signature & date</Text></View>
          ))}
        </View>
        <Footer by={generatedBy} />
      </Page>
    </Document>
  );
  return renderPdf(doc);
}
