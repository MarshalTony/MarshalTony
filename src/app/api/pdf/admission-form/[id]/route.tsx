import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { Document, Page, Text, View, Image, Footer, Letterhead, loadBranding, renderPdf, s, C } from "@/server/reports/pdf-kit";
import { photoBuffers } from "@/server/reports/photos";
import { pdfResponse } from "@/server/http";
import { fmtDate, studentName } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const st = await prisma.student.findUnique({ where: { id }, include: { schoolClass: true, stream: true, combination: true, guardians: { include: { guardian: true } } } });
  if (!st) return new Response("Not found", { status: 404 });
  const b = await loadBranding();
  const photos = await photoBuffers([st.photoFileId]);
  const photo = st.photoFileId ? photos.get(st.photoFileId) : undefined;
  const Row = ({ k, v }: { k: string; v: string | null | undefined }) => (
    <View style={[s.row, { borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 4 }]}>
      <Text style={{ width: "35%", color: C.grey }}>{k}</Text><Text style={{ width: "65%" }}>{v || "—"}</Text>
    </View>
  );
  const doc = (
    <Document title={`Admission form ${st.admissionNo}`}>
      <Page size="A4" style={s.page}>
        <Letterhead b={b} />
        <Text style={[s.title, { fontSize: 14, marginBottom: 10 }]}>STUDENT ADMISSION FORM</Text>
        <View style={s.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Row k="Admission number" v={st.admissionNo} />
            <Row k="Full name" v={studentName(st)} />
            <Row k="Gender" v={st.gender === "MALE" ? "Male" : "Female"} />
            <Row k="Date of birth" v={fmtDate(st.dateOfBirth)} />
            <Row k="Nationality" v={st.nationality} />
            <Row k="Religion" v={st.religion} />
            <Row k="Class / stream" v={`${st.schoolClass.name} ${st.stream.name}`} />
            <Row k="Combination" v={st.combination ? `${st.combination.code} — ${st.combination.name}` : null} />
            <Row k="Day / boarding" v={st.residence === "DAY" ? "Day scholar" : "Boarder"} />
            <Row k="Date of admission" v={fmtDate(st.admissionDate)} />
            <Row k="Previous school" v={st.previousSchool} />
            <Row k="Home address" v={st.homeAddress} />
            <Row k="UNEB index / LIN" v={[st.unebIndexNo, st.linNumber].filter(Boolean).join(" / ")} />
          </View>
          <View style={{ width: 100, height: 120, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            {photo ? <Image src={photo} style={{ width: 98, height: 118, objectFit: "cover" }} /> : <Text style={s.small}>Passport photo</Text>}
          </View>
        </View>
        <Text style={[s.bold, { marginTop: 14, marginBottom: 4, color: C.blue }]}>PARENTS / GUARDIANS</Text>
        {st.guardians.map((g) => <Row key={g.guardianId} k={g.relationship + (g.isPrimary ? " (primary)" : "")} v={`${g.guardian.fullName} · ${g.guardian.phone}${g.guardian.email ? " · " + g.guardian.email : ""}`} />)}
        {st.guardians.length === 0 && <Row k="Guardian" v={null} />}
        <Text style={[s.bold, { marginTop: 14, marginBottom: 4, color: C.blue }]}>HEALTH & EMERGENCY</Text>
        <Row k="Emergency contact" v={st.emergencyContactName ? `${st.emergencyContactName} (${st.emergencyContactPhone ?? ""})` : null} />
        <Row k="Medical information" v={st.medicalInfo} />
        <View style={[s.row, { marginTop: 40, justifyContent: "space-between" }]}>
          {["Parent / Guardian", "Registrar", "Headteacher"].map((l) => (
            <View key={l} style={{ width: "30%", borderTopWidth: 1, borderTopColor: C.dark, paddingTop: 3 }}><Text style={s.small}>{l} — signature & date</Text></View>
          ))}
        </View>
        <Footer by={user.fullName} />
      </Page>
    </Document>
  );
  return pdfResponse(await renderPdf(doc), `admission-${st.admissionNo.replace(/\W/g, "-")}.pdf`);
}
