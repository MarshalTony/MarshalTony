import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { Document, Page, Text, View, Image, Footer, Letterhead, loadBranding, loadHeadSignature, renderPdf, s, C } from "@/server/reports/pdf-kit";
import { photoBuffers } from "@/server/reports/photos";
import { clearanceFor, LEAVING_REASONS } from "@/server/leaving";
import { pdfResponse } from "@/server/http";
import { audit } from "@/server/audit";
import { fmtDate, fmtDateTime, studentName } from "@/lib/utils";

export const maxDuration = 60;
const DOCS = ["clearance", "certificate", "transfer", "recommendation"] as const;
type Doc = (typeof DOCS)[number];

/** Leaving documents: ?doc=clearance | certificate | transfer | recommendation */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const doc = (DOCS as readonly string[]).find((d) => d === new URL(req.url).searchParams.get("doc")) as Doc | undefined;
  if (!doc) return new Response("doc must be clearance, certificate, transfer or recommendation", { status: 400 });
  // Signed letters and certificates are issued by the office only.
  if (doc !== "clearance" && !can(user, "students.manage")) return new Response("Only the school office can issue this document.", { status: 403 });

  const { id } = await params;
  const st = await prisma.student.findUnique({
    where: { id },
    include: { schoolClass: true, stream: true, leavingRecord: true, enrollments: { include: { academicYear: true, schoolClass: true, stream: true }, orderBy: { academicYear: { startDate: "asc" } } } },
  });
  if (!st) return new Response("Not found", { status: 404 });
  const rec = st.leavingRecord;
  if ((doc === "certificate" || doc === "transfer") && !rec) return new Response("Record the student's leaving first (Students → profile → Leaving & clearance).", { status: 400 });

  const [b, school, rows, photos] = await Promise.all([
    loadBranding(), prisma.schoolSetting.findUnique({ where: { id: 1 } }),
    clearanceFor([st.id]).then((m) => m.get(st.id)!), photoBuffers([st.photoFileId]),
  ]);
  const photo = st.photoFileId ? photos.get(st.photoFileId) : undefined;
  const name = studentName(st).toUpperCase();
  const he = st.gender === "MALE" ? "he" : "she";
  const his = st.gender === "MALE" ? "his" : "her";
  const He = he[0].toUpperCase() + he.slice(1);
  const head = school?.headteacherName ? school.headteacherName : "";
  const headSig = await loadHeadSignature();
  const reason = rec ? LEAVING_REASONS.find((r) => r.value === rec.reason)?.label ?? rec.reason : null;
  const from = fmtDate(st.admissionDate);
  const to = rec ? fmtDate(rec.leavingDate) : "date";
  const years = st.enrollments.map((e) => ({ year: e.academicYear.name, cls: `${e.schoolClass.name} ${e.stream.name}` }));
  const lastClass = rec?.lastClass ?? `${st.schoolClass.name} ${st.stream.name}`;
  const allCleared = rows.every((r) => r.cleared);

  const p = { marginBottom: 8, lineHeight: 1.5, fontSize: 10.5 } as const;
  const signature = (
    <View style={{ marginTop: 26, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }} wrap={false}>
      <View>
        {headSig ? <Image src={headSig} style={{ height: 40, maxWidth: 170, objectFit: "contain", marginBottom: -4 }} /> : null}
        <Text>……………………………………………</Text>
        <Text style={s.bold}>{head || "HEADTEACHER"}</Text>
        <Text style={s.small}>Headteacher, {b.name}</Text>
      </View>
      <View style={{ width: 120, height: 70, borderWidth: 0.8, borderColor: C.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
        <Text style={s.small}>School stamp</Text>
      </View>
    </View>
  );
  const invalid = <Text style={{ marginTop: 10, textAlign: "center", color: "#b91c1c", fontFamily: "Helvetica-Bold", fontSize: 9 }}>This document is not valid without the school stamp.</Text>;
  const refLine = (
    <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
      <Text>{rec ? `Ref: ${rec.certificateNo}` : `Ref: ${st.admissionNo}`}</Text>
      <Text>Date: {fmtDate(new Date())}</Text>
    </View>
  );

  let body: React.ReactNode;
  let title: string;
  if (doc === "clearance") {
    title = "STUDENT CLEARANCE FORM";
    body = (
      <>
        <View style={[s.row, { marginBottom: 10, gap: 10 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text><Text style={s.bold}>Name: </Text>{name}</Text>
            <Text><Text style={s.bold}>Adm. No: </Text>{st.admissionNo}    <Text style={s.bold}>Class: </Text>{st.schoolClass.name} {st.stream.name}</Text>
            <Text><Text style={s.bold}>Admitted: </Text>{from}    <Text style={s.bold}>Leaving: </Text>{rec ? `${to} (${reason})` : "—"}</Text>
          </View>
          {photo ? <Image src={photo} style={{ width: 56, height: 68, objectFit: "cover" }} /> : null}
        </View>
        <View style={s.row}>
          <Text style={[s.th, { width: "22%" }]}>OFFICE</Text><Text style={[s.th, { width: "30%" }]}>SYSTEM CHECK</Text>
          <Text style={[s.th, { width: "30%" }]}>CLEARED BY / DATE / NOTE</Text><Text style={[s.th, { width: "18%" }]}>SIGNATURE</Text>
        </View>
        {rows.map((r) => (
          <View key={r.office} style={[s.row, { minHeight: 34 }]} wrap={false}>
            <Text style={[s.td, { width: "22%", fontFamily: "Helvetica-Bold" }]}>{r.label}</Text>
            <Text style={[s.td, { width: "30%", color: r.check.issue ? "#b91c1c" : C.dark }]}>{r.check.issue ?? r.check.info}</Text>
            <Text style={[s.td, { width: "30%" }]}>{r.cleared ? `${r.cleared.by}, ${fmtDateTime(r.cleared.at)}${r.cleared.note ? ` — ${r.cleared.note}` : ""}` : "PENDING"}</Text>
            <Text style={[s.td, { width: "18%" }]}> </Text>
          </View>
        ))}
        <Text style={{ marginTop: 10, fontFamily: "Helvetica-Bold", color: allCleared ? "#047857" : "#b45309" }}>
          {allCleared ? "ALL OFFICES HAVE CLEARED THIS STUDENT." : `${rows.filter((r) => !r.cleared).length} OFFICE(S) PENDING.`}
        </Text>
        {signature}
      </>
    );
  } else if (doc === "certificate") {
    title = rec!.reason === "COMPLETED" ? "SCHOOL LEAVING CERTIFICATE / TESTIMONIAL" : "SCHOOL LEAVING CERTIFICATE";
    body = (
      <>
        {refLine}
        <View style={[s.row, { gap: 12, marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={p}>This is to certify that <Text style={s.bold}>{name}</Text>, admission number <Text style={s.bold}>{st.admissionNo}</Text>{st.dateOfBirth ? <>, born on <Text style={s.bold}>{fmtDate(st.dateOfBirth)}</Text></> : null}, was a student of {b.name} from <Text style={s.bold}>{from}</Text> to <Text style={s.bold}>{to}</Text>.</Text>
          </View>
          {photo ? <Image src={photo} style={{ width: 70, height: 84, objectFit: "cover", borderWidth: 0.5, borderColor: C.line }} /> : null}
        </View>
        {years.length > 0 && (
          <View style={{ marginBottom: 10, width: "70%" }}>
            <View style={s.row}><Text style={[s.th, { width: "40%" }]}>YEAR</Text><Text style={[s.th, { width: "60%" }]}>CLASS</Text></View>
            {years.map((y) => <View key={y.year} style={s.row}><Text style={[s.td, { width: "40%" }]}>{y.year}</Text><Text style={[s.td, { width: "60%" }]}>{y.cls}</Text></View>)}
          </View>
        )}
        <Text style={p}><Text style={s.bold}>Last class: </Text>{lastClass}{st.unebIndexNo ? <>      <Text style={s.bold}>UNEB index no.: </Text>{st.unebIndexNo}</> : null}{st.linNumber ? <>      <Text style={s.bold}>LIN: </Text>{st.linNumber}</> : null}</Text>
        <Text style={p}><Text style={s.bold}>Reason for leaving: </Text>{reason}{rec!.destinationSchool ? ` — ${rec!.destinationSchool}` : ""}</Text>
        <Text style={p}><Text style={s.bold}>Conduct: </Text>{rec!.conduct}</Text>
        {rec!.remarks ? <Text style={p}><Text style={s.bold}>Remarks: </Text>{rec!.remarks}</Text> : null}
        <Text style={p}>We wish {his === "his" ? "him" : "her"} success in {his} future endeavours.</Text>
        {signature}
        {invalid}
      </>
    );
  } else if (doc === "transfer") {
    title = "TRANSFER LETTER";
    body = (
      <>
        {refLine}
        <Text style={[p, { marginBottom: 2 }]}>The Headteacher,</Text>
        <Text style={[p, { marginBottom: 12 }]}>{rec!.destinationSchool || "……………………………………………"}</Text>
        <Text style={[p, s.bold, { textDecoration: "underline" }]}>RE: TRANSFER OF {name} ({st.admissionNo})</Text>
        <Text style={p}>This is to confirm that the above-named student was a bona fide student of {b.name} from {from} to {to}, last in <Text style={s.bold}>{lastClass}</Text>.</Text>
        <Text style={p}>{rec!.reason === "TRANSFERRED" ? `${He} is leaving the school on transfer${rec!.destinationSchool ? ` to ${rec!.destinationSchool}` : ""}.` : `${He} left the school on ${to} (${(reason ?? "").toLowerCase()}).`} During {his} stay, {his} conduct was <Text style={s.bold}>{rec!.conduct.toLowerCase()}</Text>.{rec!.remarks ? ` ${rec!.remarks}` : ""}</Text>
        <Text style={p}>{allCleared ? `${He} has been cleared by all the school offices.` : `Note: ${his} clearance with the school is not yet complete.`}</Text>
        <Text style={p}>Any assistance accorded to {his === "his" ? "him" : "her"} will be highly appreciated.</Text>
        <Text style={p}>Yours faithfully,</Text>
        {signature}
        {invalid}
      </>
    );
  } else {
    title = "RECOMMENDATION LETTER";
    const current = st.status === "ACTIVE";
    body = (
      <>
        {refLine}
        <Text style={[p, s.bold]}>TO WHOM IT MAY CONCERN</Text>
        <Text style={[p, s.bold, { textDecoration: "underline" }]}>RE: RECOMMENDATION FOR {name}</Text>
        <Text style={p}>
          {name} ({st.admissionNo}) {current ? `is a student of ${b.name}, currently in ${st.schoolClass.name} ${st.stream.name}. ${He} joined the school on ${from}.` : `was a student of ${b.name} from ${from} to ${to}, last in ${lastClass}.`}
        </Text>
        <Text style={p}>During {his} time at the school, {his} conduct has been <Text style={s.bold}>{(rec?.conduct ?? "good").toLowerCase()}</Text>.{rec?.remarks ? ` ${rec.remarks}` : ""}</Text>
        <Text style={p}>I therefore recommend {his === "his" ? "him" : "her"} without reservation for any opportunity {he} may be seeking. Any assistance given to {his === "his" ? "him" : "her"} will be highly appreciated.</Text>
        <Text style={p}>Yours faithfully,</Text>
        {signature}
        {invalid}
      </>
    );
  }

  const pdf = (
    <Document title={`${title} — ${name}`} author={b.name}>
      <Page size="A4" style={[s.page, { paddingBottom: 40, fontSize: 10 }]}>
        <Letterhead b={b} />
        <Text style={[s.title, { fontSize: 14, marginVertical: 8 }]}>{title}</Text>
        {body}
        <Footer by={user.fullName} pages={false} />
      </Page>
    </Document>
  );
  await audit(user.id, "LEAVING_DOCUMENT", "Student", st.id, { doc, certificateNo: rec?.certificateNo });
  return pdfResponse(await renderPdf(pdf), `${doc}-${st.admissionNo.replace(/\W+/g, "-")}.pdf`);
}
