import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { saveItem, stockMovement } from "@/server/actions/ops";
import { CheckboxField, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDate, isoDate, ugx } from "@/lib/utils";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("inventory.manage");
  const params = await searchParams;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);
  const where = { ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }, { serialNo: { contains: q, mode: "insensitive" as const } }] } : {}), ...(sp(params, "categoryId") ? { categoryId: sp(params, "categoryId") } : {}), ...(sp(params, "kind") ? { isAsset: sp(params, "kind") === "asset" } : {}) };
  const [items, total, cats, suppliers, movements, low] = await Promise.all([
    prisma.inventoryItem.findMany({ where, include: { category: true }, orderBy: { name: "asc" }, skip, take }),
    prisma.inventoryItem.count({ where }),
    prisma.inventoryCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({ include: { item: true }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.$queryRaw<{ id: string; name: string; qty: number; reorder: number; unit: string }[]>`SELECT id, name, "quantityOnHand"::float qty, "reorderLevel"::float reorder, unit FROM "InventoryItem" WHERE "isAsset" = false AND "quantityOnHand" <= "reorderLevel" AND "reorderLevel" > 0 ORDER BY name`,
  ]);
  const fields = (i?: (typeof items)[number]) => (
    <>
      {i && <input type="hidden" name="id" value={i.id} />}
      <Grid cols={3}>
        <TextField label="Code" name="code" defaultValue={i?.code} required />
        <TextField label="Name" name="name" defaultValue={i?.name} required className="sm:col-span-2" />
        <SelectField label="Category" name="categoryId" defaultValue={i?.categoryId} required options={cats.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField label="Unit" name="unit" defaultValue={i?.unit ?? "pcs"} required />
        <TextField label="Unit cost (UGX)" name="unitCost" type="number" min="0" defaultValue={i?.unitCost?.toString() ?? ""} />
        <TextField label="Reorder level" name="reorderLevel" type="number" min="0" defaultValue={String(Number(i?.reorderLevel ?? 0))} required />
        <TextField label="Location" name="location" defaultValue={i?.location ?? ""} />
        <TextField label="Serial no. (assets)" name="serialNo" defaultValue={i?.serialNo ?? ""} />
        <TextField label="Condition" name="condition" defaultValue={i?.condition ?? ""} />
      </Grid>
      <CheckboxField name="isAsset" label="Fixed asset (computer, furniture, lab equipment) — tracked individually" defaultChecked={i?.isAsset} />
    </>
  );
  return (
    <>
      <PageHeader title="Inventory & assets" actions={<FormDialog trigger="New item / asset" title="New inventory item" action={saveItem} wide>{fields()}</FormDialog>} />
      {low.length > 0 && <Alert tone="warn" className="mb-4"><b>Reorder alert:</b> {low.map((l) => `${l.name} (${l.qty} ${l.unit}, reorder at ${l.reorder})`).join(" · ")}</Alert>}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar searchPlaceholder="Name, code or serial no." filters={[
            { name: "categoryId", label: "Category", options: cats.map((c) => ({ value: c.id, label: c.name })) },
            { name: "kind", label: "Type", options: [{ value: "stock", label: "Consumable stock" }, { value: "asset", label: "Fixed assets" }] },
          ]} />
          <Table>
            <THead><tr><TH>Item</TH><TH>Category</TH><TH className="text-right">On hand</TH><TH className="text-right">Value</TH><TH /></tr></THead>
            <tbody>
              {items.map((i) => {
                const lowStock = !i.isAsset && Number(i.reorderLevel) > 0 && Number(i.quantityOnHand) <= Number(i.reorderLevel);
                return (
                  <TR key={i.id}>
                    <TD><p className="font-medium">{i.name} {i.isAsset && <Badge color="purple">asset</Badge>}</p><p className="text-xs text-slate-500">{i.code}{i.location ? ` · ${i.location}` : ""}{i.serialNo ? ` · S/N ${i.serialNo}` : ""}{i.condition ? ` · ${i.condition}` : ""}</p></TD>
                    <TD className="text-xs">{i.category.name}</TD>
                    <TD className={`text-right ${lowStock ? "font-semibold text-red-700" : ""}`}>{Number(i.quantityOnHand)} {i.unit}</TD>
                    <TD className="text-right text-xs">{i.unitCost ? ugx(Number(i.unitCost) * Number(i.quantityOnHand), false) : "—"}</TD>
                    <TD className="flex justify-end gap-1">
                      <FormDialog trigger="Stock" title={`Stock movement — ${i.name}`} action={stockMovement} triggerSize="sm" triggerVariant="secondary">
                        <input type="hidden" name="itemId" value={i.id} />
                        <Grid>
                          <SelectField label="Type" name="type" options={[{ value: "RECEIVED", label: "Received (+)" }, { value: "ISSUED", label: "Issued (−)" }, { value: "ADJUSTMENT", label: "Adjustment (±, e.g. -3)" }]} />
                          <TextField label="Quantity" name="quantity" type="number" step="any" required />
                          <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
                          <SelectField label="Supplier (received)" name="supplierId" placeholder="—" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                          <TextField label="Issued to" name="issuedTo" placeholder="Department / person" />
                          <TextField label="Reference (PO, delivery note)" name="reference" />
                        </Grid>
                        <TextField label="Note / reason" name="note" />
                      </FormDialog>
                      <FormDialog trigger="Edit" title="Edit item" action={saveItem} triggerSize="sm" triggerVariant="outline" wide>{fields(i)}</FormDialog>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <Pagination base="/inventory" params={params} total={total} page={page} pageSize={pageSize} />
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Recent stock movements</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {movements.map((m) => <p key={m.id}><span className={Number(m.quantity) < 0 ? "text-red-700" : "text-emerald-700"}>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)}</span> {m.item.name} <span className="text-xs text-slate-500">· {m.type.toLowerCase()} {fmtDate(m.date)}{m.issuedTo ? ` → ${m.issuedTo}` : ""}{m.note ? ` (${m.note})` : ""}</span></p>)}
            {movements.length === 0 && <p className="text-slate-500">None yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
