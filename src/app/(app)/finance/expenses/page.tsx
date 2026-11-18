import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { decideExpense, markExpensePaid, requestExpense, saveExpenseCategory, voidExpense } from "@/server/actions/finance";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { StatusBadge } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

const METHODS = [{ value: "CASH", label: "Cash" }, { value: "BANK", label: "Bank" }, { value: "MOBILE_MONEY", label: "Mobile Money" }, { value: "CHEQUE", label: "Cheque" }];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("finance.view", "finance.manage");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const q = sp(params, "q");
  const where = {
    ...(sp(params, "status") ? { status: sp(params, "status") } : {}),
    ...(sp(params, "categoryId") ? { categoryId: sp(params, "categoryId") } : {}),
    ...(q ? { OR: [{ voucherNo: { contains: q, mode: "insensitive" as const } }, { payee: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, cats, suppliers] = await Promise.all([
    prisma.expense.findMany({ where, include: { category: true, supplier: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip, take }),
    prisma.expense.count({ where }),
    prisma.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => [r.requestedById, r.approvedById].filter(Boolean) as string[]) } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const manage = can(user, "finance.manage");
  const approve = can(user, "finance.approve");
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {manage && (
          <>
            <FormDialog trigger="Expense categories" title="New expense category" action={saveExpenseCategory} triggerVariant="outline">
              <TextField label="Name" name="name" required />
              <CheckboxField name="isActive" label="Active" defaultChecked />
              <p className="text-xs text-slate-500">Existing: {cats.map((c) => c.name).join(", ")}</p>
            </FormDialog>
            <FormDialog trigger="New payment voucher" title="New payment voucher" action={requestExpense} wide>
              <Grid>
                <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
                <SelectField label="Category" name="categoryId" required placeholder="Select" options={cats.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))} />
                <SelectField label="Supplier" name="supplierId" placeholder="— none —" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                <TextField label="Payee" name="payee" required />
                <TextField label="Amount (UGX)" name="amount" type="number" min="1" required />
                <SelectField label="Method" name="method" required options={METHODS} />
                <TextField label="Reference (cheque/transfer no.)" name="reference" />
              </Grid>
              <TextAreaField label="Description" name="description" rows={2} required />
            </FormDialog>
          </>
        )}
      </div>
      <FilterBar searchPlaceholder="Voucher no., payee or description" filters={[
        { name: "status", label: "Status", options: ["PENDING", "APPROVED", "PAID", "REJECTED", "VOIDED"].map((s) => ({ value: s, label: s })) },
        { name: "categoryId", label: "Category", options: cats.map((c) => ({ value: c.id, label: c.name })) },
      ]} />
      <Table>
        <THead><tr><TH>Date</TH><TH>Voucher</TH><TH>Category</TH><TH>Payee / description</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH /></tr></THead>
        <tbody>
          {rows.map((e) => (
            <TR key={e.id}>
              <TD className="whitespace-nowrap text-xs">{fmtDate(e.date)}</TD>
              <TD className="font-mono text-xs">{e.voucherNo}</TD>
              <TD className="text-xs">{e.category.name}</TD>
              <TD>{e.payee}<p className="text-xs text-slate-500">{e.description}</p><p className="text-xs text-slate-400">Requested by {users.get(e.requestedById)}{e.approvedById ? ` · decided by ${users.get(e.approvedById)}` : ""}{e.voidReason ? ` · ${e.voidReason}` : ""}</p></TD>
              <TD className="text-right">{ugx(e.amount)}</TD>
              <TD><StatusBadge status={e.status} /></TD>
              <TD>
                <div className="flex flex-wrap justify-end gap-1">
                  {approve && e.status === "PENDING" && (
                    <>
                      <ConfirmAction action={decideExpense} fields={{ id: e.id, decision: "APPROVED" }} label="Approve" variant="success" />
                      <FormDialog trigger="Reject" title="Reject voucher" action={decideExpense} triggerVariant="outline" triggerSize="sm">
                        <input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="REJECTED" />
                        <TextField label="Reason" name="note" required />
                      </FormDialog>
                    </>
                  )}
                  {manage && e.status === "APPROVED" && (
                    <FormDialog trigger="Mark paid" title={`Pay ${e.voucherNo}`} action={markExpensePaid} triggerVariant="secondary" triggerSize="sm">
                      <input type="hidden" name="id" value={e.id} /><TextField label="Payment reference" name="reference" defaultValue={e.reference ?? ""} />
                    </FormDialog>
                  )}
                  {approve && e.status !== "VOIDED" && e.status !== "REJECTED" && (
                    <FormDialog trigger="Void" title={`Void ${e.voucherNo}`} action={voidExpense} triggerVariant="ghost" triggerSize="sm">
                      <input type="hidden" name="id" value={e.id} /><TextField label="Reason" name="reason" required />
                    </FormDialog>
                  )}
                </div>
              </TD>
            </TR>
          ))}
          {rows.length === 0 && <TR><TD colSpan={7} className="py-6 text-center text-slate-500">No vouchers.</TD></TR>}
        </tbody>
      </Table>
      <Pagination base="/finance/expenses" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}
