import React from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { canSeeStudentFees } from "@/server/fees/access";
import { Document, Page, Text, View, Letterhead, loadBranding, renderPdf, s, C } from "@/server/reports/pdf-kit";
import { pdfResponse } from "@/server/http";
import { fmtDateTime, studentName, ugx } from "@/lib/utils";

function words(n: number): string {
  const a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const h = (x: number): string => x < 20 ? a[x] : x < 100 ? `${b[Math.floor(x / 10)]}${x % 10 ? "-" + a[x % 10] : ""}` : `${a[Math.floor(x / 100)]} hundred${x % 100 ? " and " + h(x % 100) : ""}`;
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [v, w] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) if (n >= v) { parts.push(`${h(Math.floor(n / v))} ${w}`); n %= v; }
  if (n) parts.push(h(n));
  return parts.join(" ");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const p = await prisma.payment.findUnique({ where: { id }, include: { student: { include: { schoolClass: true, stream: true } }, method: true, term: { include: { academicYear: true } }, reversal: true } });
  if (!p || !(await canSeeStudentFees(user, p.studentId))) return new Response("Not found", { status: 404 });
  const recorder = await prisma.user.findUnique({ where: { id: p.recordedById }, select: { fullName: true } });
  // Balance as it stood immediately after this payment (receipts can be reprinted later).
  const entry = await prisma.ledgerEntry.findFirst({ where: { sourceId: p.id, type: "PAYMENT" } });
  const agg = await prisma.ledgerEntry.aggregate({ where: { studentId: p.studentId, createdAt: { lte: entry?.createdAt ?? p.createdAt } }, _sum: { debit: true, credit: true } });
  const balance = Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
  const b = await loadBranding();
  const amt = Math.round(Number(p.amount));
  const Row = ({ k, v }: { k: string; v: string }) => <View style={[s.row, { paddingVertical: 3 }]}><Text style={{ width: "38%", color: C.grey }}>{k}</Text><Text style={{ width: "62%" }}>{v}</Text></View>;
  const doc = (
    <Document title={`Receipt ${p.receiptNo}`}>
      <Page size="A5" style={s.page}>
        <Letterhead b={b} />
        <Text style={[s.title, { fontSize: 14 }]}>OFFICIAL RECEIPT</Text>
        <Text style={[s.small, { textAlign: "center", marginBottom: 10 }]}>No. {p.receiptNo} · Transaction {p.transactionRef}</Text>
        {p.reversal && <Text style={{ color: "#b91c1c", textAlign: "center", fontFamily: "Helvetica-Bold", marginBottom: 6 }}>REVERSED — {p.reversal.reason}</Text>}
        <Row k="Date" v={fmtDateTime(p.paidAt)} />
        <Row k="Received from" v={p.payerName || "—"} />
        <Row k="Student" v={`${studentName(p.student)} (${p.student.admissionNo})`} />
        <Row k="Class" v={`${p.student.schoolClass.name} ${p.student.stream.name}`} />
        <Row k="Term" v={`${p.term.academicYear.name} ${p.term.name}`} />
        <Row k="Payment method" v={`${p.method.name}${p.externalRef ? ` — ref ${p.externalRef}` : ""}`} />
        <View style={{ marginVertical: 10, padding: 8, backgroundColor: C.light, borderRadius: 4 }}>
          <Text style={[s.bold, { fontSize: 16, color: C.blue }]}>{ugx(amt)}</Text>
          <Text style={{ fontFamily: "Helvetica-Oblique", marginTop: 2 }}>Uganda Shillings {words(amt)} only</Text>
        </View>
        <Row k="Balance after payment" v={ugx(balance)} />
        {p.notes ? <Row k="Notes" v={p.notes} /> : null}
        <View style={[s.row, { marginTop: 28, justifyContent: "space-between" }]}>
          <View style={{ width: "45%", borderTopWidth: 1, borderTopColor: C.dark, paddingTop: 3 }}><Text style={s.small}>Received by: {recorder?.fullName ?? ""}</Text></View>
          <View style={{ width: "45%", borderTopWidth: 1, borderTopColor: C.dark, paddingTop: 3 }}><Text style={s.small}>Stamp</Text></View>
        </View>
        <Text style={[s.small, { marginTop: 14, textAlign: "center" }]}>Computer-generated receipt. Verify with the transaction number above. Printed {fmtDateTime(new Date())}.</Text>
      </Page>
    </Document>
  );
  return pdfResponse(await renderPdf(doc), `receipt-${p.receiptNo}.pdf`);
}
