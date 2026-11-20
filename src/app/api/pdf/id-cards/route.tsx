import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { Document, Page, Text, View, Image, loadBranding, renderPdf, C } from "@/server/reports/pdf-kit";
import { photoBuffers } from "@/server/reports/photos";
import { pdfResponse } from "@/server/http";
import { studentName } from "@/lib/utils";

/** CR80-size ID cards, 8 per A4 sheet. ?studentId=… or ?streamId=… */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  const streamId = url.searchParams.get("streamId");
  if (!studentId && !streamId) return new Response("Specify studentId or streamId", { status: 400 });
  const students = await prisma.student.findMany({
    where: studentId ? { id: studentId } : { streamId: streamId!, status: "ACTIVE" },
    include: { schoolClass: true, stream: true }, orderBy: { lastName: "asc" },
  });
  const [b, photos, year] = await Promise.all([loadBranding(), photoBuffers(students.map((s) => s.photoFileId), { maxPx: 400 }), prisma.academicYear.findFirst({ where: { isCurrent: true } })]);
  const W = 242.6, H = 153; // 85.6 × 54 mm
  const doc = (
    <Document title="Student ID cards">
      <Page size="A4" style={{ padding: 24, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {students.map((st) => {
          const p = st.photoFileId ? photos.get(st.photoFileId) : undefined;
          return (
            <View key={st.id} wrap={false} style={{ width: W, height: H, borderWidth: 1, borderColor: C.blue, borderRadius: 6, overflow: "hidden" }}>
              <View style={{ backgroundColor: C.blue, padding: 5, flexDirection: "row", alignItems: "center" }}>
                {b.logo && <Image src={b.logo} style={{ width: 20, height: 20, marginRight: 5 }} />}
                <View>
                  <Text style={{ color: "white", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{b.name.toUpperCase()}</Text>
                  <Text style={{ color: "#bfdbfe", fontSize: 6 }}>STUDENT IDENTITY CARD {year ? `· ${year.name}` : ""}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", padding: 6, gap: 8 }}>
                <View style={{ width: 62, height: 76, borderWidth: 0.5, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
                  {p ? <Image src={p} style={{ width: 61, height: 75, objectFit: "cover" }} /> : <Text style={{ fontSize: 6, color: C.grey }}>PHOTO</Text>}
                </View>
                <View style={{ flex: 1, fontSize: 7.5, gap: 2 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>{studentName(st)}</Text>
                  <Text>Adm. No: {st.admissionNo}</Text>
                  <Text>Class: {st.schoolClass.name} {st.stream.name}</Text>
                  <Text>Status: {st.residence === "DAY" ? "Day scholar" : "Boarder"}</Text>
                  <Text>Sex: {st.gender === "MALE" ? "Male" : "Female"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 6, color: C.grey, paddingHorizontal: 6 }}>If found, please return to the school. {b.contacts}</Text>
            </View>
          );
        })}
      </Page>
    </Document>
  );
  return pdfResponse(await renderPdf(doc), "id-cards.pdf");
}
