import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { createPurchaseOrder, setPurchaseOrderStatus } from "@/server/actions/finance";
import { ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

export default async function POPage() {
  const user = await requirePage("finance.view", "finance.manage");
  const [orders, suppliers] = await Promise.all([
    prisma.purchaseOrder.findMany({ include: { supplier: true, items: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const manage = can(user, "finance.manage");
  return (
    <>
      {manage && (
        <div className="mb-3 flex justify-end">
          <FormDialog trigger="New purchase order" title="New purchase order" action={createPurchaseOrder} wide>
            <Grid>
              <SelectField label="Supplier" name="supplierId" required placeholder="Select" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
            </Grid>
            <TextAreaField label="Items — one per line: Description, quantity, unit price" name="items" rows={5} required className="font-mono" placeholder={"Exercise books 96pg, 500, 1200\nChalk boxes, 40, 6000"} />
            <TextField label="Notes" name="notes" />
          </FormDialog>
        </div>
      )}
      <Table>
        <THead><tr><TH>PO no.</TH><TH>Date</TH><TH>Supplier</TH><TH>Items</TH><TH className="text-right">Total</TH><TH>Status</TH><TH /></tr></THead>
        <tbody>
          {orders.map((o) => (
            <TR key={o.id}>
              <TD className="font-mono text-xs">{o.poNumber}</TD><TD className="text-xs">{fmtDate(o.date)}</TD><TD>{o.supplier.name}</TD>
              <TD className="text-xs">{o.items.map((i) => `${i.description} × ${Number(i.quantity)} @ ${ugx(i.unitPrice, false)}`).join("; ")}</TD>
              <TD className="text-right">{ugx(o.total)}</TD><TD><StatusBadge status={o.status} /></TD>
              <TD className="flex justify-end gap-1">
                {manage && o.status === "DRAFT" && can(user, "finance.approve") && <ConfirmAction action={setPurchaseOrderStatus} fields={{ id: o.id, status: "APPROVED" }} label="Approve" variant="success" />}
                {manage && o.status === "APPROVED" && <ConfirmAction action={setPurchaseOrderStatus} fields={{ id: o.id, status: "RECEIVED" }} label="Mark received" variant="secondary" />}
                {manage && (o.status === "DRAFT" || o.status === "APPROVED") && <ConfirmAction action={setPurchaseOrderStatus} fields={{ id: o.id, status: "CANCELLED" }} label="Cancel" confirm="Cancel this purchase order?" />}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
