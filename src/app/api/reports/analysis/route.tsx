import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { loadAnalysis, DEFAULT_OPTIONS } from "@/server/exams/analysis";
import { Document, Page, Text, View, Footer, Letterhead, loadBranding, renderPdf, s, C } from "@/server/reports/pdf-kit";
import { pdfResponse } from "@/server/http";
import { audit } from "@/server/audit";

export const maxDuration = 60;
const f = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const d = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);

/** Results analysis PDF for staff meetings: ?examId&classId&compareId(|none)&pass&fail&drop */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "results.view", "exams.manage")) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const examId = p.get("examId"), classId = p.get("classId");
  if (!examId || !classId) return new Response("examId and classId required", { status: 400 });
  const num = (k: string, def: number) => { const v = Number(p.get(k)); return Number.isFinite(v) && v > 0 ? v : def; };
  const opts = { passMark: num("pass", DEFAULT_OPTIONS.passMark), failLimit: num("fail", DEFAULT_OPTIONS.failLimit), dropLimit: num("drop", DEFAULT_OPTIONS.dropLimit) };
  const compareId = p.get("compareId") && p.get("compareId") !== "none" ? p.get("compareId") : null;
  if (!(await prisma.examClass.findUnique({ where: { examId_classId: { examId, classId } } }))) return new Response("This class is not part of this examination.", { status: 404 });
  const [a, b] = await Promise.all([loadAnalysis(examId, classId, compareId, opts), loadBranding()]);
  const sm = a.summary;
  const fill = (n: number | null) => (n === null ? "white" : n >= 70 ? "#ecfdf5" : n >= opts.passMark ? "#fffbeb" : "#fef2f2");

  const H = ({ children }: { children: React.ReactNode }) => <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: C.blue, marginTop: 10, marginBottom: 4 }}>{children}</Text>;
  const Row = ({ cells, widths, head, bg }: { cells: React.ReactNode[]; widths: number[]; head?: boolean; bg?: string[] }) => (
    <View style={s.row} wrap={false}>
      {cells.map((c, i) => <Text key={i} style={[head ? s.th : s.td, { width: `${widths[i]}%`, fontSize: 7.5, backgroundColor: head ? C.blue : bg?.[i] ?? "white" }]}>{c}</Text>)}
    </View>
  );
  const nS = a.streams.length;
  const subjW = [20, 5, ...a.streams.map(() => Math.max(9, 45 / Math.max(1, nS))), 8, ...(a.compareExam ? [7] : []), 7, 7];
  const scale = 100 / subjW.reduce((x, y) => x + y, 0);
  const sw = subjW.map((w) => w * scale);

  const doc = (
    <Document title={`Results analysis — ${a.cls.name}`} author={b.name}>
      <Page size="A4" orientation="landscape" style={[s.page, { paddingBottom: 34 }]}>
        <Letterhead b={b} />
        <Text style={s.title}>RESULTS ANALYSIS — {a.cls.name.toUpperCase()}</Text>
        <Text style={[s.small, { textAlign: "center", marginBottom: 6 }]}>
          {a.exam.name} · {a.exam.term.name} {a.exam.term.academicYear.name}{a.compareExam ? ` · compared with ${a.compareExam.name} (${a.compareExam.term.name} ${a.compareExam.term.academicYear.name})` : ""} · pass mark {opts.passMark}%
        </Text>
        <View style={[s.row, { gap: 6, marginBottom: 4 }]}>
          {[
            ["Candidates", String(sm.candidates)],
            ["Class average", `${f(sm.classAvg)}%${sm.prevClassAvg !== null && sm.classAvg !== null ? ` (${d(sm.classAvg - sm.prevClassAvg)})` : ""}`],
            [`Pass rate ≥${opts.passMark}%`, sm.passRate === null ? "—" : `${sm.passRate}%`],
            ["Boys / girls", `${f(sm.boysAvg)} / ${f(sm.girlsAvg)}`],
            ["Streams", sm.streamAvg.map((x) => `${a.cls.code}${x.name}: ${f(x.avg)}`).join("  ")],
            ["Grades", Object.keys(sm.grades).sort().map((g) => `${g}:${sm.grades[g]}`).join(" ")],
            ["At risk", String(a.risk.length)],
          ].map(([k, v]) => (
            <View key={k} style={{ borderWidth: 0.5, borderColor: C.blue, borderRadius: 3, padding: 4, flexGrow: 1 }}>
              <Text style={s.small}>{k}</Text><Text style={[s.bold, { fontSize: 9 }]}>{v}</Text>
            </View>
          ))}
        </View>

        <H>Subjects by stream (average %, subject teacher)</H>
        <Row head widths={sw} cells={["Subject", "Sat", ...a.streams.map((st) => `${a.cls.code} ${st.name}`), "Overall", ...(a.compareExam ? ["Change"] : []), "Boys", "Girls"]} />
        {a.subjects.map((sub) => (
          <Row key={sub.id} widths={sw}
            bg={["white", "white", ...sub.byStream.map((c) => fill(c.avg)), fill(sub.overall)]}
            cells={[sub.name, String(sub.sat), ...sub.byStream.map((c) => `${f(c.avg)}${c.teachers.length ? `  ${c.teachers.join("/")}` : ""}`), f(sub.overall), ...(a.compareExam ? [d(sub.delta)] : []), f(sub.boys), f(sub.girls)]} />
        ))}

        <H>Teachers</H>
        {a.teachers.length === 0 ? <Text style={s.small}>No teacher allocations for this class and year.</Text> : (
          <>
            <Row head widths={[28, 52, 8, 12]} cells={["Teacher", "Teaches", "Marks", "Average"]} />
            {a.teachers.map((t) => <Row key={t.teacher} widths={[28, 52, 8, 12]} bg={["white", "white", "white", fill(t.avg)]} cells={[t.teacher, t.teaches, String(t.marks), f(t.avg)]} />)}
          </>
        )}

        {a.compareExam && (
          <View style={[s.row, { gap: 12 }]}>
            {([["Most improved", a.improved], ["Biggest drops", a.dropped]] as const).map(([title, list]) => (
              <View key={title} style={{ flex: 1 }}>
                <H>{title}</H>
                {list.length === 0 ? <Text style={s.small}>None.</Text> : (
                  <>
                    <Row head widths={[46, 12, 14, 14, 14]} cells={["Student", "Stream", "Before", "Now", "Change"]} />
                    {list.map((c) => <Row key={c.studentId} widths={[46, 12, 14, 14, 14]} cells={[c.name, c.stream, f(c.previous), f(c.avg), d(c.delta)]} />)}
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        <H>Students at risk ({a.risk.length}) — average below {opts.passMark}%, below {opts.passMark}% in {opts.failLimit}+ subjects{a.compareExam ? `, or dropped ${opts.dropLimit}+ points` : ""}</H>
        {a.risk.length === 0 ? <Text style={s.small}>None.</Text> : (
          <>
            <Row head widths={[26, 8, 9, 9, 48]} cells={["Student", "Stream", "Average", "Below pass", "Why"]} />
            {a.risk.map((r) => <Row key={r.studentId} widths={[26, 8, 9, 9, 48]} bg={["white", "white", fill(r.avg)]} cells={[r.name, r.stream, f(r.avg), String(r.failed), r.reasons.join("; ")]} />)}
          </>
        )}
        <Text style={[s.small, { marginTop: 8 }]}>Colours: green 70%+, amber {opts.passMark}–69%, red below {opts.passMark}%. Teacher averages are for discussion: results also depend on the class, the paper and the time of year.</Text>
        <Footer by={user.fullName} />
      </Page>
    </Document>
  );
  await audit(user.id, "ANALYSIS_REPORT", "Exam", examId, { classId, compareId });
  return pdfResponse(await renderPdf(doc), `results-analysis-${a.cls.code}.pdf`);
}
