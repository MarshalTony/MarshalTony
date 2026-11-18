import "server-only";
import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { readStoredFile } from "../storage";

export const C = { blue: "#1d4ed8", dark: "#0f172a", grey: "#64748b", line: "#cbd5e1", light: "#eff6ff" };

export const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: C.dark },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: C.blue, paddingBottom: 8, marginBottom: 10 },
  logo: { width: 46, height: 46, marginRight: 10 },
  school: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.blue },
  small: { fontSize: 8, color: C.grey },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2, textAlign: "center" },
  th: { backgroundColor: C.blue, color: "white", fontFamily: "Helvetica-Bold", padding: 3, fontSize: 8 },
  td: { padding: 3, fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: C.line },
  row: { flexDirection: "row" },
  footer: { position: "absolute", bottom: 14, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.grey },
  bold: { fontFamily: "Helvetica-Bold" },
});

export type Branding = { name: string; motto: string | null; contacts: string; logo: Buffer | null; footer: string | null };

export async function loadBranding(): Promise<Branding> {
  const sch = await prisma.schoolSetting.findUnique({ where: { id: 1 } });
  let logo: Buffer | null = null;
  if (sch?.logoFileId) {
    const f = await prisma.storedFile.findUnique({ where: { id: sch.logoFileId } });
    if (f && f.mimeType !== "image/webp") logo = await readStoredFile(f.key, f.data).catch(() => null);
  }
  return {
    name: sch?.name ?? "Bishop Ogez High School",
    motto: sch?.motto ?? null,
    contacts: [sch?.poBox, sch?.address, sch?.phone, sch?.email, sch?.website].filter(Boolean).join(" · "),
    logo,
    footer: sch?.reportFooter ?? null,
  };
}

export function Letterhead({ b, right }: { b: Branding; right?: React.ReactNode }) {
  return (
    <View style={s.header}>
      {b.logo ? <Image src={b.logo} style={s.logo} /> : (
        <View style={[s.logo, { backgroundColor: C.blue, borderRadius: 4, alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: "white", fontSize: 16, fontFamily: "Helvetica-Bold" }}>BO</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.school}>{b.name.toUpperCase()}</Text>
        {b.motto ? <Text style={[s.small, { fontFamily: "Helvetica-Oblique" }]}>&quot;{b.motto}&quot;</Text> : null}
        <Text style={s.small}>{b.contacts}</Text>
      </View>
      {right}
    </View>
  );
}

export function Footer({ by, pages = true }: { by: string; pages?: boolean }) {
  return (
    <View style={s.footer} fixed>
      <Text>Generated {new Date().toLocaleString("en-GB", { timeZone: "Africa/Kampala" })} by {by} · Bishop Ogez SMIS</Text>
      {pages ? <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /> : null}
    </View>
  );
}

export function renderPdf(doc: React.ReactElement) {
  return renderToBuffer(doc as any);
}

export { Document, Page, Text, View, Image };
