import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { copyFeeStructures, saveFeeStructure } from "@/server/actions/fees";
import { FormDialog, SelectField, TextAreaField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { sp, type SP } from "@/components/data-table";
import { ugx } from "@/lib/utils";

export default async function StructuresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("fees.view");
  const params = await searchParams;
  const [terms, classes, current] = await Promise.all([
    prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" } }),
    prisma.schoolClass.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
  ]);
  const termId = sp(params, "termId") ?? current?.id;
  const structures = await prisma.feeStructure.findMany({ where: { termId }, include: { items: true, schoolClass: true }, orderBy: [{ schoolClass: { order: "asc" } }, { residence: "asc" }] });
  const termOpts = terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }));
  const manage = can(user, "fees.manage");
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {manage && (
          <>
            <FormDialog trigger="Copy from another term" title="Copy fee structures" action={copyFeeStructures} triggerVariant="outline">
              <SelectField label="From term" name="fromTermId" required options={termOpts} />
              <SelectField label="To term" name="toTermId" required defaultValue={termId} options={termOpts} />
            </FormDialog>
            <FormDialog trigger="Set fee structure" title="Set fee structure" action={saveFeeStructure} wide>
              <SelectField label="Term" name="termId" required defaultValue={termId} options={termOpts} />
              <SelectField label="Day / boarding" name="residence" required options={[{ value: "DAY", label: "Day scholars" }, { value: "BOARDING", label: "Boarders" }]} />
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Classes</legend>
                <div className="flex flex-wrap gap-3">{classes.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="classIds[]" value={c.id} />{c.name}</label>)}</div>
              </fieldset>
              <TextAreaField label="Fee items — one per line: Name, amount" name="lines" rows={6} required placeholder={"Tuition, 800000\nBoarding, 450000\nDevelopment fund, 50000"} className="font-mono" />
            </FormDialog>
          </>
        )}
      </div>
      <FilterBar filters={[{ name: "termId", label: "Term", allowAll: false, value: termId, options: termOpts }]} />
      {structures.length === 0 ? <EmptyState title="No fee structures for this term">Use “Set fee structure” or copy from a previous term.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {structures.map((s) => {
            const total = s.items.reduce((a, i) => a + Number(i.amount), 0);
            return (
              <Card key={s.id}>
                <CardHeader><CardTitle>{s.schoolClass.name} — {s.residence === "DAY" ? "Day" : "Boarding"}</CardTitle><span className="font-semibold text-brand-800">{ugx(total)}</span></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {s.items.map((i) => <div key={i.id} className="flex justify-between"><span>{i.name}</span><span>{ugx(i.amount, false)}</span></div>)}
                  {manage && (
                    <div className="pt-2">
                      <FormDialog trigger="Edit" title={`Edit ${s.schoolClass.name} ${s.residence.toLowerCase()}`} action={saveFeeStructure} triggerVariant="outline" triggerSize="sm" wide>
                        <input type="hidden" name="termId" value={s.termId} />
                        <input type="hidden" name="residence" value={s.residence} />
                        <input type="hidden" name="classIds[]" value={s.classId} />
                        <TextAreaField label="Fee items — one per line: Name, amount" name="lines" rows={6} required className="font-mono" defaultValue={s.items.map((i) => `${i.name}, ${Number(i.amount)}`).join("\n")} />
                        <p className="text-xs text-slate-500">Changes apply to invoices issued from now on. Existing invoices are never altered; use adjustments.</p>
                      </FormDialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
