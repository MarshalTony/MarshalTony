import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveSupplier } from "@/server/actions/finance";
import { CheckboxField, FormDialog, Grid, TextField } from "@/components/forms";
import { Badge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { ugx } from "@/lib/utils";

export default async function SuppliersPage() {
  const user = await requirePage("finance.view", "finance.manage", "inventory.manage");
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { expenses: { where: { status: "PAID" }, select: { amount: true } }, _count: { select: { orders: true } } } });
  const fields = (s?: (typeof rows)[number]) => (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <TextField label="Name" name="name" defaultValue={s?.name} required />
      <Grid><TextField label="Phone" name="phone" defaultValue={s?.phone ?? ""} /><TextField label="Email" name="email" type="email" defaultValue={s?.email ?? ""} /><TextField label="TIN" name="tinNumber" defaultValue={s?.tinNumber ?? ""} /><TextField label="Address" name="address" defaultValue={s?.address ?? ""} /></Grid>
      <CheckboxField name="isActive" label="Active" defaultChecked={s?.isActive ?? true} />
    </>
  );
  const manage = can(user, "finance.manage");
  return (
    <>
      {manage && <div className="mb-3 flex justify-end"><FormDialog trigger="New supplier" title="New supplier" action={saveSupplier}>{fields()}</FormDialog></div>}
      <Table>
        <THead><tr><TH>Supplier</TH><TH>Contacts</TH><TH>TIN</TH><TH>POs</TH><TH className="text-right">Total paid</TH><TH /></tr></THead>
        <tbody>
          {rows.map((s) => (
            <TR key={s.id}>
              <TD className="font-medium">{s.name} {!s.isActive && <Badge color="red">inactive</Badge>}</TD>
              <TD className="text-xs">{s.phone}<br />{s.email}</TD><TD className="text-xs">{s.tinNumber}</TD><TD>{s._count.orders}</TD>
              <TD className="text-right">{ugx(s.expenses.reduce((a, e) => a + Number(e.amount), 0))}</TD>
              <TD className="text-right">{manage && <FormDialog trigger="Edit" title="Edit supplier" action={saveSupplier} triggerVariant="outline" triggerSize="sm">{fields(s)}</FormDialog>}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
