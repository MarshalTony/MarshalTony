import "server-only";
import React from "react";
import ExcelJS from "exceljs";
import { Document, Page, Text, View, Footer, Letterhead, loadBranding, renderPdf, s, C } from "./pdf-kit";
import { csvResponse, pdfResponse, xlsxResponse } from "../http";
import type { CurrentUser } from "../auth";
import { audit } from "../audit";

export type ReportColumn = { key: string; header: string; width?: number; align?: "left" | "right" | "center"; money?: boolean };
export type ReportSpec = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null | undefined>[];
  totals?: Record<string, string | number>;
  landscape?: boolean;
  filename: string;
};

const fmt = (v: unknown, money?: boolean) =>
  v === null || v === undefined ? "" : money && typeof v === "number" ? new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(v) : String(v);

/** Renders the same table as PDF, XLSX or CSV with school branding and generation details. */
export async function tableReport(spec: ReportSpec, format: string | null, user: CurrentUser) {
  await audit(user.id, "REPORT", "Report", spec.filename, { title: spec.title, format: format ?? "pdf", rows: spec.rows.length });
  const by = `${user.fullName} (${user.username})`;
  if (format === "csv") {
    const rows: (string | number | null | undefined)[][] = [[spec.title], spec.subtitle ? [spec.subtitle] : [], [`Generated ${new Date().toISOString()} by ${by}`], [], spec.columns.map((c) => c.header)];
    for (const r of spec.rows) rows.push(spec.columns.map((c) => r[c.key]));
    if (spec.totals) rows.push(spec.columns.map((c) => spec.totals![c.key] ?? ""));
    return csvResponse(rows, `${spec.filename}.csv`);
  }
  const b = await loadBranding();
  if (format === "xlsx" || format === "excel") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(spec.title.slice(0, 31));
    ws.addRow([b.name.toUpperCase()]).font = { bold: true, size: 14, color: { argb: "FF1D4ED8" } };
    ws.addRow([b.contacts]).font = { size: 9, color: { argb: "FF64748B" } };
    ws.addRow([spec.title]).font = { bold: true, size: 12 };
    if (spec.subtitle) ws.addRow([spec.subtitle]);
    ws.addRow([`Generated ${new Date().toLocaleString("en-GB", { timeZone: "Africa/Kampala" })} by ${by}`]).font = { italic: true, size: 9 };
    ws.addRow([]);
    const head = ws.addRow(spec.columns.map((c) => c.header));
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }));
    for (const r of spec.rows) ws.addRow(spec.columns.map((c) => r[c.key] ?? ""));
    if (spec.totals) ws.addRow(spec.columns.map((c) => spec.totals![c.key] ?? "")).font = { bold: true };
    spec.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(10, Math.min(45, (c.width ?? c.header.length + 6)));
      if (c.money) col.numFmt = "#,##0";
    });
    return xlsxResponse(Buffer.from(await wb.xlsx.writeBuffer()), `${spec.filename}.xlsx`);
  }
  const totalWidth = spec.columns.reduce((a, c) => a + (c.width ?? 10), 0);
  const cell = (c: ReportColumn) => ({ width: `${((c.width ?? 10) / totalWidth) * 100}%`, textAlign: c.align ?? (c.money ? "right" : "left") }) as const;
  const doc = (
    <Document title={spec.title} author={b.name}>
      <Page size="A4" orientation={spec.landscape ? "landscape" : "portrait"} style={s.page}>
        <Letterhead b={b} />
        <Text style={s.title}>{spec.title}</Text>
        {spec.subtitle ? <Text style={[s.small, { textAlign: "center", marginBottom: 8 }]}>{spec.subtitle}</Text> : <View style={{ marginBottom: 6 }} />}
        <View style={s.row} fixed>
          {spec.columns.map((c) => <Text key={c.key} style={[s.th, cell(c)]}>{c.header}</Text>)}
        </View>
        {spec.rows.map((r, i) => (
          <View key={i} style={[s.row, { backgroundColor: i % 2 ? C.light : "white" }]} wrap={false}>
            {spec.columns.map((c) => <Text key={c.key} style={[s.td, cell(c)]}>{fmt(r[c.key], c.money)}</Text>)}
          </View>
        ))}
        {spec.rows.length === 0 && <Text style={[s.td, { textAlign: "center" }]}>No records.</Text>}
        {spec.totals && (
          <View style={[s.row, { borderTopWidth: 1, borderTopColor: C.dark }]}>
            {spec.columns.map((c) => <Text key={c.key} style={[s.td, s.bold, cell(c)]}>{fmt(spec.totals![c.key], c.money)}</Text>)}
          </View>
        )}
        <Footer by={by} />
      </Page>
    </Document>
  );
  return pdfResponse(await renderPdf(doc), `${spec.filename}.pdf`);
}
