import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { invoiceStudent, postAdjustmentAction, recordPayment, reversePaymentAction } from "@/server/actions/fees";
import { ActionForm, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { withRunningBalance } from "@/lib/fees";
import { fmtDate, isoDate, studentName, ugx } from "@/lib/utils";

export default async function StudentAccount({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requirePage("fees.view", "fees.collect");
  const { id } = await params;
  const receiptId = sp(await searchParams, "receipt");
  const student = await prisma.student.findUnique({ where: { id }, include: { schoolClass: true, stream: true, guardians: { where: { isPrimary: true }, include: { guardian: true } } } });
  if (!student) notFound();
  const [ledger, payments, methods, terms, current] = await Promise.all([
    prisma.ledgerEntry.findMany({ where: { studentId: id }, orderBy: { createdAt: "asc" }, include: { term: { include: { academicYear: true } } } }),
    prisma.payment.findMany({ where: { studentId: id }, include: { method: true, reversal: true }, orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] }),
    prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
  ]);
  const rows = withRunningBalance(ledger);
  const balance = rows.length ? rows[rows.length - 1].balance : 0;
  const termOpts = terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }));
  const g = student.guardians[0]?.guardian;
  const receipt = receiptId ? payments.find((p) => p.id === receiptId) : undefined;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold"><Link href={`/students/${student.id}`} className="hover:underline">{studentName(student)}</Link></h2>
          <p className="text-sm text-slate-500">{student.admissionNo} · {student.schoolClass.name} {student.stream.name} · {student.residence === "DAY" ? "Day" : "Boarding"}{g ? ` · ${g.fullName} (${g.phone})` : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Balance</p>
          <p className={`text-2xl font-bold ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>{ugx(balance)}</p>
          <p className="text-xs text-slate-500">{balance > 0 ? "owed to the school" : balance < 0 ? "credit (prepaid)" : "fully paid"}</p>
        </div>
      </div>
      {receipt && (
        <Alert tone="success" className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>Payment of {ugx(receipt.amount)} recorded — receipt {receipt.receiptNo}.</span>
          <Button asChild size="sm" variant="success"><a href={`/api/pdf/receipt/${receipt.id}`} target="_blank"><Printer />Print receipt</a></Button>
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Statement</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Button asChild size="sm" variant="outline"><a href={`/api/pdf/statement/${student.id}`} target="_blank"><FileText />Statement PDF</a></Button>
                {can(user, "fees.manage") && (
                  <FormDialog trigger="Invoice" title="Issue an invoice" action={invoiceStudent} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="studentId" value={student.id} />
                    <SelectField label="Term" name="termId" required defaultValue={current?.id} options={termOpts} />
                    <TextAreaField label="Charges — one per line: Name, amount" name="lines" rows={4} required placeholder={"Trip to Murchison Falls, 120000"} className="font-mono" />
                    <TextField label="Due date" name="dueDate" type="date" />
                  </FormDialog>
                )}
                {can(user, "fees.reverse") && (
                  <FormDialog trigger="Adjustment / scholarship" title="Post an adjustment" action={postAdjustmentAction} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="studentId" value={student.id} />
                    <SelectField label="Type" name="type" required options={[
                      { value: "DISCOUNT", label: "Discount (reduces balance)" }, { value: "SCHOLARSHIP", label: "Scholarship (reduces balance)" },
                      { value: "BURSARY", label: "Bursary (reduces balance)" }, { value: "WAIVER", label: "Waiver (reduces balance)" },
                      { value: "CREDIT_ADJUSTMENT", label: "Credit adjustment (reduces balance)" }, { value: "DEBIT_ADJUSTMENT", label: "Debit adjustment (increases balance)" },
                      { value: "OPENING_BALANCE", label: "Opening balance brought forward (increases balance)" },
                    ]} />
                    <Grid><TextField label="Amount (UGX)" name="amount" type="number" min="1" required /><SelectField label="Term" name="termId" defaultValue={current?.id} placeholder="—" options={termOpts} /></Grid>
                    <TextAreaField label="Reason / authority" name="reason" rows={2} required />
                  </FormDialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Date</TH><TH>Reference</TH><TH>Description</TH><TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH></tr></THead>
                <tbody>
                  {rows.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-xs">{fmtDate(e.createdAt)}</TD>
                      <TD className="font-mono text-xs">{e.reference}</TD>
                      <TD className="text-xs">{e.description}{e.term ? <span className="text-slate-400"> · {e.term.academicYear.name} {e.term.name}</span> : null}</TD>
                      <TD className="text-right">{Number(e.debit) ? ugx(e.debit, false) : ""}</TD>
                      <TD className="text-right">{Number(e.credit) ? ugx(e.credit, false) : ""}</TD>
                      <TD className="text-right font-medium">{ugx(e.balance, false)}</TD>
                    </TR>
                  ))}
                  {rows.length === 0 && <TR><TD colSpan={6} className="text-slate-500">No transactions yet.</TD></TR>}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Paid</TH><TH>Receipt</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH /></tr></THead>
                <tbody>
                  {payments.map((p) => (
                    <TR key={p.id}>
                      <TD className="text-xs">{fmtDate(p.paidAt)}</TD>
                      <TD className="font-mono text-xs"><a className="text-brand-700 hover:underline" href={`/api/pdf/receipt/${p.id}`} target="_blank">{p.receiptNo}</a></TD>
                      <TD className="text-xs">{p.method.name}{p.externalRef ? ` · ${p.externalRef}` : ""}</TD>
                      <TD className="text-right">{ugx(p.amount)}</TD>
                      <TD className="text-right">
                        {p.reversal ? <span title={p.reversal.reason}><StatusBadge status="REVERSED" /></span> : can(user, "fees.reverse") && (
                          <FormDialog trigger="Reverse" title={`Reverse receipt ${p.receiptNo}`} action={reversePaymentAction} triggerVariant="outline" triggerSize="sm">
                            <input type="hidden" name="paymentId" value={p.id} />
                            <Alert tone="warn">The payment stays on record; a reversal entry adds {ugx(p.amount)} back to the balance.</Alert>
                            <TextAreaField label="Reason (e.g. bounced cheque, wrong student)" name="reason" rows={2} required />
                          </FormDialog>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
        {can(user, "fees.collect") && (
          <Card className="h-fit">
            <CardHeader><CardTitle>Receive payment</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={recordPayment} submitLabel="Record payment & issue receipt" submitVariant="success" resetOnSuccess>
                <input type="hidden" name="studentId" value={student.id} />
                <TextField label="Amount (UGX)" name="amount" type="number" min="1" step="1" required inputMode="numeric" />
                <SelectField label="Payment method" name="methodId" required placeholder="Select" options={methods.map((m) => ({ value: m.id, label: m.name }))} />
                <TextField label="Bank slip / MoMo / cheque reference" name="externalRef" hint="Required for non-cash payments; duplicates are refused" />
                <SelectField label="Term" name="termId" required defaultValue={current?.id} options={termOpts} />
                <TextField label="Date paid" name="paidAt" type="date" defaultValue={isoDate(new Date())} required />
                <Grid>
                  <TextField label="Paid by" name="payerName" defaultValue={g?.fullName ?? ""} />
                  <TextField label="Payer phone" name="payerPhone" defaultValue={g?.phone ?? ""} />
                </Grid>
                <TextField label="Notes" name="notes" />
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
