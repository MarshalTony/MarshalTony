import "server-only";
import React from "react";
import { prisma } from "@/lib/db";
import { Page, Text, View, Image, loadHeadSignature, type Branding } from "./pdf-kit";
import { loadPaperBands } from "../exams/results";
import { gradeSubject, initials, paperLabel, SUBJECT_POINTS, termAverage } from "@/lib/uace";

/**
 * S5–S6 report in the school's A-Level format (as on its existing card): every subject's papers (P/1, P/2; S/1 for
 * General Paper and Sub-Maths) with the term's exams (B.O.T, E.O.T…), the average, the paper grade D1–F9, the subject
 * grade A–F from the paper grades, a comment and the teacher's initials; total points; grading scale and points key.
 */
const ink = "#000000";
const t = {
  page: { paddingTop: 22, paddingBottom: 22, paddingHorizontal: 24, fontSize: 8.5, fontFamily: "Helvetica", color: ink },
  b: { fontFamily: "Helvetica-Bold" },
  cell: { borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: ink, paddingHorizontal: 2, justifyContent: "center" as const },
  row: { flexDirection: "row" as const },
};
const ROW_H = 14;

type Ctx = {
  exam: { id: string; termId: string; examType: { code: string; name: string; order: number }; term: { number: number; endDate: Date; nextTermStart: Date | null; academicYearId: string; academicYear: { name: string } } };
  b: Branding;
  school: { name: string; poBox: string | null; address: string | null; phone: string | null; altPhone: string | null; website: string | null; email: string | null; altEmail: string | null; motto: string | null; reportFooter: string | null };
  photos: Map<string, Buffer>;
};

const dmy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "—");
const dotted = (code: string) => (code.length <= 4 ? code.split("").join(".") : code); // BOT → B.O.T
const classLabel = (code: string, stream: string) => `${code.replace(/^S(\d)$/, "S.$1")} ${stream}`;
const subAbbrev = (s: { code: string; shortName: string | null }) => s.shortName || (s.code === "S-MTC" ? "SM" : s.code === "S-ICT" ? "ICT" : s.code);

export async function buildALevelPages(ctx: Ctx, studentIds: string[]) {
  const { exam, b, school } = ctx;
  const pages = new Map<string, React.ReactElement>();
  if (!studentIds.length) return pages;
  const yearId = exam.term.academicYearId;
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    include: {
      schoolClass: true, stream: true, combination: true,
      enrollments: { where: { academicYearId: yearId }, include: { schoolClass: true, stream: true } },
      subjects: { where: { academicYearId: yearId }, include: { subject: true } },
      reportComments: { where: { examId: exam.id } },
    },
  });
  // The term's exams up to this one (e.g. printing EOT shows B.O.T and E.O.T), each with its classes and subject maxima.
  const termExams = (await prisma.exam.findMany({
    where: { termId: exam.termId, isComposite: false, examType: { order: { lte: exam.examType.order } } },
    include: { examType: true, classes: true, subjects: true },
  })).sort((x, y) => x.examType.order - y.examType.order || x.createdAt.getTime() - y.createdAt.getTime());
  const [marks, allocations, paperBands] = await Promise.all([
    prisma.mark.findMany({ where: { examId: { in: termExams.map((e) => e.id) }, studentId: { in: studentIds } } }),
    prisma.teacherAllocation.findMany({ where: { academicYearId: yearId }, include: { staff: true } }),
    loadPaperBands(),
  ]);
  const headSig = await loadHeadSignature();
  const markOf = new Map(marks.map((m) => [`${m.examId}:${m.studentId}:${m.subjectId}:${m.paper}`, m]));
  const local = (p: string) => p.replace(/\s/g, "").replace(/^\+?256/, "0");
  const phones = [school.phone, school.altPhone].filter(Boolean).map((p) => local(p!)).join("/");
  const emails = [school.email, school.altEmail].filter(Boolean).join("/");
  const title = `${exam.examType.name.toUpperCase()} ${exam.term.number} ${exam.term.academicYear.name}`; // e.g. END OF TERM 3 2026

  for (const st of students) {
    const enr = st.enrollments[0];
    const classId = enr?.classId ?? st.classId;
    const streamId = enr?.streamId ?? st.streamId;
    const cls = enr?.schoolClass ?? st.schoolClass;
    const stream = enr?.stream ?? st.stream;
    // Exams this student's class sat (the current exam always shows).
    const exams = termExams.filter((e) => e.id === exam.id || e.classes.some((c) => c.classId === classId));
    const subjects = st.subjects.map((x) => x.subject)
      .sort((x, y) => x.reportOrder - y.reportOrder || (x.category === y.category ? 0 : x.category === "SUBSIDIARY" ? -1 : 1) || x.name.localeCompare(y.name));
    const teacherInitials = (subjectId: string) =>
      [...new Set(allocations.filter((a) => a.subjectId === subjectId && a.streamId === streamId).map((a) => initials(a.staff.lastName, a.staff.firstName)))].join("/");

    const groups = subjects.map((sub) => {
      const n = Math.max(1, sub.paperCount);
      const papers = Array.from({ length: n }, (_, i) => {
        const paper = i + 1;
        // Only exams in which the subject is set for this class count towards the average.
        const cols = exams.map((e) => {
          const es = e.subjects.find((x) => x.classId === classId && x.subjectId === sub.id);
          if (!es) return { examId: e.id, set: false, text: "", pct: null as number | null };
          const m = markOf.get(`${e.id}:${st.id}:${sub.id}:${paper}`);
          const max = Number(es.maxMarks) || 100;
          if (!m) return { examId: e.id, set: true, text: "", pct: null };
          if (m.status !== "PRESENT" || m.score === null) return { examId: e.id, set: true, text: m.status === "ABSENT" ? "ABS" : "EX", pct: m.status === "ABSENT" ? 0 : null };
          const pct = Math.round((Number(m.score) / max) * 100 * 100) / 100;
          return { examId: e.id, set: true, text: String(Math.round(pct)), pct };
        });
        const counted = cols.filter((c) => c.set && c.text !== "EX");
        const avg = termAverage(counted.map((c) => c.pct));
        return { paper, label: paperLabel(sub.category, paper), cols, avg };
      });
      // A paper with no mark while another paper of the subject has one counts 0 (F9).
      const graded = gradeSubject(sub.category, papers.map((p) => p.avg), paperBands);
      return { sub, papers: papers.map((p, i) => ({ ...p, band: graded?.papers[i].band ?? null })), graded };
    });
    const totalPoints = groups.reduce((a, g) => a + (g.graded?.points ?? 0), 0);
    const subsidiary = st.subjects.map((x) => x.subject).find((s) => s.category === "SUBSIDIARY" && s.code !== "GP");
    const combination = st.combination ? `${st.combination.code}${subsidiary ? `/${subAbbrev(subsidiary)}` : ""}` : "";
    const comment = st.reportComments[0];
    const name = [st.lastName, st.firstName, st.otherNames].filter(Boolean).join(" ").toUpperCase();
    const photo = st.photoFileId ? ctx.photos.get(st.photoFileId) : undefined;

    // Column widths (points) — A4 inner width ≈ 547
    const W = { subject: 90, paper: 34, exam: 30, avg: 46, pgrade: 66, grade: 38, comment: 92, initial: 0 };
    const examsW = W.exam * exams.length;
    W.initial = 547 - 2 - (W.subject + W.paper + examsW + W.avg + W.pgrade + W.grade + W.comment);
    const C = (w: number, children: React.ReactNode, extra: Record<string, unknown> = {}) => (
      <View style={[t.cell, { width: w, height: ROW_H, flexShrink: 0 }, extra as object] as any}><Text>{children}</Text></View>
    );
    const H = (w: number, label: string) => C(w, label, { ...t.b, height: 15, alignItems: "center" });

    pages.set(st.id, (
      <Page key={st.id} size="A4" style={t.page}>
        <View style={{ borderWidth: 1, borderColor: ink, borderRadius: 8, padding: 8, flexGrow: 1 }}>
          {/* Crest watermark */}
          {b.logo ? (
            <View fixed style={{ position: "absolute", top: 210, left: 110, width: 330, height: 330, opacity: 0.09 }}>
              <Image src={b.logo} style={{ width: 330, height: 330, objectFit: "contain" }} />
            </View>
          ) : null}

          {/* Letterhead */}
          <View style={t.row}>
            <View style={{ width: 90, alignItems: "center", paddingTop: 6 }}>
              {b.logo ? <Image src={b.logo} style={{ width: 80, height: 80, objectFit: "contain" }} /> : null}
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={[t.b, { fontSize: 15, marginBottom: 4 }]}>{school.name.toUpperCase()}</Text>
              {school.poBox || school.address ? <Text style={[t.b, { fontSize: 10 }]}>Address: {(school.poBox || school.address)!.toUpperCase()}</Text> : null}
              {phones ? <Text style={[t.b, { fontSize: 10 }]}>Tel:{phones}.</Text> : null}
              {school.website ? <Text style={[t.b, { fontSize: 10 }]}>Website: {school.website}</Text> : null}
              {emails ? <Text style={[t.b, { fontSize: 10 }]}>Email: {emails}</Text> : null}
              {school.motto ? <Text style={{ fontSize: 10, marginTop: 3 }}>&quot;{school.motto.toUpperCase()}&quot;</Text> : null}
              <Text style={[t.b, { fontSize: 10, marginTop: 8 }]}>{title}</Text>
            </View>
            <View style={{ width: 90, alignItems: "center", paddingTop: 6 }}>
              {photo ? <Image src={photo} style={{ width: 66, height: 78, objectFit: "cover" }} /> : null}
            </View>
          </View>
          <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: ink, height: 3, marginTop: 6 }} />

          {/* Student details */}
          <View style={[t.row, { marginTop: 12, marginBottom: 8, fontSize: 10 }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={t.row}>
                <Text style={{ width: 200 }}><Text style={t.b}>Name: </Text>{name}</Text>
                <Text><Text style={t.b}>RegNo: </Text>{st.admissionNo.replace(/\//g, "")}</Text>
              </View>
              <View style={t.row}>
                <Text style={{ width: 160 }}><Text style={t.b}>Class: </Text>{classLabel(cls.code, stream.name)}</Text>
                <Text><Text style={t.b}>Combination: </Text>{combination}</Text>
              </View>
            </View>
            <View style={{ width: 120 }}>
              <Text style={t.b}>LIN:</Text>
              <Text>{st.linNumber ?? ""}</Text>
            </View>
          </View>

          {/* Results table */}
          <View style={{ borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: ink }}>
            <View style={t.row}>
              {H(W.subject, "SUBJECT")}{H(W.paper, "PAPER")}
              {exams.map((e) => <React.Fragment key={e.id}>{H(W.exam, dotted(e.examType.code))}</React.Fragment>)}
              {H(W.avg, "AVERAGE")}{H(W.pgrade, "PAPER GRADE")}{H(W.grade, "GRADE")}{H(W.comment, "COMMENT")}{H(W.initial, "INITIAL")}
            </View>
            {groups.map((g) => {
              const h = ROW_H * g.papers.length;
              const ini = teacherInitials(g.sub.id);
              return (
                <View key={g.sub.id} style={t.row} wrap={false}>
                  {C(W.subject, g.sub.name, { height: h })}
                  <View>
                    {g.papers.map((p) => (
                      <View key={p.paper} style={t.row}>
                        {C(W.paper, p.label, { alignItems: "center" })}
                        {p.cols.map((c) => <React.Fragment key={c.examId}>{C(W.exam, c.text, { alignItems: "center" })}</React.Fragment>)}
                        {C(W.avg, p.avg ?? "", { alignItems: "center" })}
                        {C(W.pgrade, p.band?.grade ?? "", { alignItems: "center" })}
                      </View>
                    ))}
                  </View>
                  {C(W.grade, g.graded?.grade ?? "", { height: h, alignItems: "center" })}
                  <View>
                    {g.papers.map((p) => (
                      <View key={p.paper} style={t.row}>
                        {C(W.comment, p.band?.remark ?? "", { fontSize: 8 })}
                        {C(W.initial, ini, { alignItems: "center" })}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            {groups.length === 0 && <View style={t.row}>{C(545, "No subjects recorded for this student this year.")}</View>}
          </View>

          <Text style={[t.b, { fontSize: 16, textAlign: "center", marginTop: 12, marginBottom: 10 }]}>TOTAL POINTS: {totalPoints}</Text>

          {/* Grading scale and points key */}
          <View wrap={false}>
            <Text style={[t.b, { marginBottom: 2 }]}>GRADING SCALE</Text>
            <View style={{ borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: ink }}>
              {[(bd: (typeof paperBands)[number]) => bd.grade, (bd: (typeof paperBands)[number]) => `${Math.round(bd.minScore)}-${Math.floor(bd.maxScore)}`].map((f, i) => (
                <View key={i} style={t.row}>
                  {[...paperBands].sort((x, y) => y.minScore - x.minScore).map((bd) => (
                    <View key={bd.grade} style={[t.cell, { flex: 1, height: 13 }]}><Text>{f(bd)}</Text></View>
                  ))}
                </View>
              ))}
            </View>
            <Text style={[t.b, { marginTop: 2, marginBottom: 2 }]}>KEY FOR POINTS</Text>
            <View style={{ borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: ink }}>
              {[(x: (typeof SUBJECT_POINTS)[number]) => x.grade, (x: (typeof SUBJECT_POINTS)[number]) => String(x.points)].map((f, i) => (
                <View key={i} style={t.row}>
                  {SUBJECT_POINTS.map((x) => <View key={x.grade} style={[t.cell, { flex: 1, height: 13, alignItems: "center" }]}><Text>{f(x)}</Text></View>)}
                </View>
              ))}
            </View>
          </View>

          {/* Comments */}
          <View style={{ marginTop: 16, gap: 10, fontSize: 9 }} wrap={false}>
            {[["Class Teacher's Comment:", comment?.classTeacherComment], ["Signature:", ""], ["Head Teacher's Comment:", comment?.headteacherComment], ["Signature:", ""]].map(([label, text], i) => (
              <View key={i} style={[t.row, { alignItems: "flex-end" }]}>
                <Text style={{ width: 118 }}>{label}</Text>
                <View style={{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: ink, borderStyle: "dashed", minHeight: 12, paddingBottom: 1 }}>
                  {i === 3 && headSig
                    ? <Image src={headSig} style={{ height: 30, maxWidth: 150, objectFit: "contain", marginBottom: -3 }} />
                    : <Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{(text ?? "").toUpperCase()}</Text>}
                </View>
              </View>
            ))}
          </View>

          <Text style={[t.b, { marginTop: 18, textAlign: "center", fontSize: 9 }]}>
            This Term has ended On: <Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{dmy(exam.term.endDate)}</Text> Next Term Begins On: <Text style={{ fontFamily: "Helvetica-BoldOblique" }}>{dmy(exam.term.nextTermStart)}</Text>
          </Text>
          {school.reportFooter ? <Text style={{ marginTop: 10, textAlign: "center", color: "#d40000", fontFamily: "Helvetica-Oblique", fontSize: 9 }}>{school.reportFooter}</Text> : null}
        </View>
      </Page>
    ));
  }
  return pages;
}
