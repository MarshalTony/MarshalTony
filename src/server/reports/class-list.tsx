import "server-only";
import React from "react";
import { Document, Page, Text, View, Image, Footer, Letterhead, loadBranding, renderPdf, s, C } from "./pdf-kit";
import { photoBuffers } from "./photos";
import { fmtDate } from "@/lib/utils";

export const LAYOUTS = ["nominal", "attendance", "marks", "contacts", "photos"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Columns for the custom (nominal roll) layout. */
export const COLUMNS = {
  photo: "Photo", adm: "Adm. No.", name: "Name", sex: "Sex", class: "Class", residence: "Day/Boarding",
  dob: "Date of birth", lin: "LIN", schoolpay: "SchoolPay", parent: "Parent / guardian", phone: "Parent phone", subjects: "Subjects",
} as const;
export type Column = keyof typeof COLUMNS;
export const CONTACT_COLUMNS: Column[] = ["parent", "phone"];

export type ListStudent = {
  id: string; admissionNo: string; name: string; gender: "MALE" | "FEMALE"; cls: string; residence: "DAY" | "BOARDING";
  dateOfBirth: Date | null; linNumber: string | null; schoolPayCode: string | null; photoFileId: string | null;
  parent: string; phone: string; subjects: string;
};

export type ListOptions = {
  layout: Layout; title: string; subtitle: string; columns: Column[]; blank: number; blankLabels: string[]; landscape: boolean; generatedBy: string;
};

/** Relative widths; "name" and "subjects" take what is left. */
const WIDTH: Record<Column, number> = { photo: 7, adm: 13, name: 0, sex: 5, class: 8, residence: 9, dob: 10, lin: 14, schoolpay: 10, parent: 18, phone: 13, subjects: 0 };

function cellText(st: ListStudent, c: Column): string {
  switch (c) {
    case "adm": return st.admissionNo;
    case "name": return st.name;
    case "sex": return st.gender === "MALE" ? "M" : "F";
    case "class": return st.cls;
    case "residence": return st.residence === "DAY" ? "Day" : "Boarding";
    case "dob": return st.dateOfBirth ? fmtDate(st.dateOfBirth) : "";
    case "lin": return st.linNumber ?? "";
    case "schoolpay": return st.schoolPayCode ?? "";
    case "parent": return st.parent;
    case "phone": return st.phone;
    case "subjects": return st.subjects;
    default: return "";
  }
}

export async function renderClassList(students: ListStudent[], o: ListOptions) {
  const b = await loadBranding();
  const wantPhotos = o.layout === "photos" || (o.layout === "nominal" && o.columns.includes("photo"));
  const photos = wantPhotos ? await photoBuffers(students.map((x) => x.photoFileId)) : new Map<string, Buffer>();
  const boys = students.filter((x) => x.gender === "MALE").length;
  const girls = students.length - boys;
  const orientation = o.landscape ? "landscape" : "portrait";

  // Fixed columns per layout; blank columns are added for attendance / marks.
  const cols: Column[] =
    o.layout === "attendance" ? ["name", "sex"]
    : o.layout === "marks" ? ["adm", "name"]
    : o.layout === "contacts" ? ["name", "class", "parent", "phone"]
    : o.columns.length ? o.columns : ["adm", "name", "sex", "class", "residence"];
  const blanks = o.layout === "attendance" || o.layout === "marks"
    ? Array.from({ length: o.blank }, (_, i) => o.blankLabels[i] ?? (o.layout === "attendance" ? "" : ""))
    : o.layout === "nominal" ? o.blankLabels : [];
  // Exact widths in points (A4 minus margins) so header and rows line up; nothing may shrink.
  const pageW = (o.landscape ? 842 : 595) - 56;
  const pct = (p: number) => (pageW * p) / 100;
  const numW = pct(4);
  const blankW = o.layout === "attendance" ? Math.min(pct(5), (pageW * 0.6) / Math.max(1, blanks.length)) : pct(9);
  const fixedW = numW + cols.reduce((a, c) => a + pct(WIDTH[c]), 0) + blanks.length * blankW;
  const flexCols = cols.filter((c) => WIDTH[c] === 0);
  const flexW = Math.max(pct(14), (pageW - fixedW) / Math.max(1, flexCols.length));
  const w = (c: Column) => (WIDTH[c] ? pct(WIDTH[c]) : flexW);
  const fit = (width: number) => ({ width, flexGrow: 0, flexShrink: 0 });
  const rowH = cols.includes("photo") ? 40 : o.layout === "attendance" || o.layout === "marks" ? 17 : undefined;
  const td = { ...s.td, borderRightWidth: 0.5, borderRightColor: C.line } as const;

  const head = (
    <>
      <Letterhead b={b} />
      <Text style={s.title}>{o.title}</Text>
      {o.subtitle ? <Text style={[s.small, { textAlign: "center", marginBottom: 6 }]}>{o.subtitle}</Text> : <View style={{ marginBottom: 6 }} />}
    </>
  );

  const table = (
    <View>
      <View style={s.row} fixed>
        <Text style={[s.th, fit(numW), { textAlign: "center" }]}>#</Text>
        {cols.map((c) => <Text key={c} style={[s.th, fit(w(c))]}>{COLUMNS[c]}</Text>)}
        {blanks.map((l, i) => <Text key={i} style={[s.th, fit(blankW), { textAlign: "center", fontSize: 7, paddingHorizontal: 1, borderLeftWidth: 0.5, borderLeftColor: "white" }]}>{l}</Text>)}
      </View>
      {students.map((st, i) => (
        <View key={st.id} style={[s.row, { backgroundColor: i % 2 ? C.light : "white", minHeight: rowH }]} wrap={false}>
          <Text style={[td, fit(numW), { textAlign: "center" }]}>{i + 1}</Text>
          {cols.map((c) => c === "photo" ? (
            <View key={c} style={[td, fit(w(c)), { padding: 1, alignItems: "center" }]}>
              {st.photoFileId && photos.get(st.photoFileId) ? <Image src={photos.get(st.photoFileId)!} style={{ width: 30, height: 36, objectFit: "cover" }} /> : null}
            </View>
          ) : (
            <Text key={c} style={[td, fit(w(c)), c === "name" ? s.bold : c === "subjects" ? { fontSize: 6.5 } : {}]}>{cellText(st, c)}</Text>
          ))}
          {blanks.map((_, j) => <Text key={j} style={[td, fit(blankW)]}> </Text>)}
        </View>
      ))}
    </View>
  );

  const totals = (
    <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
      <Text style={s.bold}>Total: {students.length}   ·   Boys: {boys}   ·   Girls: {girls}</Text>
      {o.layout === "nominal" || o.layout === "attendance" ? <Text>Class teacher: ______________________   Signature: __________   Date: __________</Text> : null}
    </View>
  );

  const photoGrid = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {students.map((st) => {
        const p = st.photoFileId ? photos.get(st.photoFileId) : undefined;
        return (
          <View key={st.id} wrap={false} style={{ width: o.landscape ? 96 : 84, borderWidth: 0.5, borderColor: C.line, borderRadius: 3, padding: 3, alignItems: "center" }}>
            <View style={{ width: o.landscape ? 88 : 76, height: o.landscape ? 106 : 92, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center" }}>
              {p ? <Image src={p} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Text style={{ fontSize: 6, color: C.grey }}>NO PHOTO</Text>}
            </View>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 2 }}>{st.name}</Text>
            <Text style={{ fontSize: 6, color: C.grey }}>{st.admissionNo} · {st.cls}</Text>
          </View>
        );
      })}
    </View>
  );

  const doc = (
    <Document title={o.title} author={b.name}>
      <Page size="A4" orientation={orientation} style={[s.page, { paddingBottom: 34 }]}>
        {head}
        {students.length === 0 ? <Text>No students match this selection.</Text> : o.layout === "photos" ? photoGrid : table}
        {students.length > 0 && totals}
        <Footer by={o.generatedBy} />
      </Page>
    </Document>
  );
  return renderPdf(doc);
}
