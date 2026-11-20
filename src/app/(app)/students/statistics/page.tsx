import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requirePage } from "@/server/auth";
import { enrolmentTable, VIEWS, VIEW_LABEL, type View } from "@/server/enrolment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";

export const metadata = { title: "Enrolment statistics" };

/** Enrolment statistics for returns (EMIS / school census) and board meetings. */
export default async function StatisticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("students.view");
  const v = sp(await searchParams, "view");
  const view = ((VIEWS as readonly string[]).includes(v ?? "") ? v : "class") as View;
  const t = await enrolmentTable(view);
  return (
    <>
      <PageHeader
        title="Enrolment statistics"
        description="Figures for the Ministry's school census (EMIS), board meetings and planning. Download any table for the return."
        actions={<Button asChild variant="outline"><Link href="/students">Back to students</Link></Button>}
      />
      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Tables">
        {VIEWS.map((x) => (
          <Link key={x} href={`/students/statistics?view=${x}`} className={`rounded-full border px-3 py-1 text-sm ${x === view ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white hover:border-brand-400"}`}>{VIEW_LABEL[x]}</Link>
        ))}
      </nav>
      <Card>
        <CardHeader>
          <CardTitle>{t.title}<span className="block text-xs font-normal text-slate-500">{t.subtitle}</span></CardTitle>
          <span className="flex gap-2">
            <Button asChild size="sm" variant="outline"><a href={`/api/reports/enrolment?view=${view}&format=xlsx`}><Download />Excel</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`/api/reports/enrolment?view=${view}&format=pdf`} target="_blank"><FileText />PDF</a></Button>
          </span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {t.rows.length === 0 ? <p className="text-sm text-slate-500">Nothing to show for this year.</p> : (
            <Table>
              <THead><tr>{t.columns.map((c) => <TH key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.header}</TH>)}</tr></THead>
              <tbody>
                {t.rows.map((r, i) => (
                  <TR key={i} className={String(r.cls ?? "").endsWith("— total") ? "bg-slate-50 font-semibold" : ""}>
                    {t.columns.map((c) => <TD key={c.key} className={`${c.align === "right" ? "text-right tabular-nums" : ""} ${c.key.endsWith("_T") ? "font-semibold" : ""}`}>{r[c.key] ?? ""}</TD>)}
                  </TR>
                ))}
                <TR className="border-t-2 border-slate-300 bg-brand-50 font-bold">
                  {t.columns.map((c) => <TD key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>{t.totals[c.key] ?? ""}</TD>)}
                </TR>
              </tbody>
            </Table>
          )}
          {view === "age" && <p className="mt-2 text-xs text-slate-500">Students without a date of birth are counted under “Unknown” — add dates of birth (Students → Data check) for a complete return.</p>}
        </CardContent>
      </Card>
    </>
  );
}
