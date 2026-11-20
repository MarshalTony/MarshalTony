import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveSubjectOrder } from "@/server/actions/academics";
import { SubjectOrder } from "@/components/subject-order";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** The order subjects print on report cards and broadsheets, per level. */
export default async function SubjectOrderPage() {
  const user = await requirePage("academics.view");
  const manage = can(user, "academics.manage");
  const subjects = await prisma.subject.findMany({ where: { isActive: true }, orderBy: [{ reportOrder: "asc" }, { name: "asc" }] });
  return (
    <>
      <p className="mb-3 text-sm text-slate-600">Set the order in which subjects appear on report cards and broadsheets. Use ▲ / ▼ to move a subject, then <b>Save order</b>.</p>
      <div className="grid gap-5 lg:grid-cols-2">
        {(["O_LEVEL", "A_LEVEL"] as const).map((level) => (
          <Card key={level}>
            <CardHeader><CardTitle>{level === "O_LEVEL" ? "O-Level (S1–S4)" : "A-Level (S5–S6)"}</CardTitle></CardHeader>
            <CardContent>
              <SubjectOrder action={saveSubjectOrder} level={level} readOnly={!manage}
                subjects={subjects.filter((s) => s.level === level).map((s) => ({ id: s.id, name: s.name, code: s.shortName || s.code, category: s.category }))} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
