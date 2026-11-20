import { getCurrentUser, can } from "@/server/auth";
import { enrolmentTable, VIEWS, type View } from "@/server/enrolment";
import { tableReport } from "@/server/reports/table";

/** Enrolment statistics download: ?view=class|age|residence|admissions|leavers&format=xlsx|pdf|csv */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "students.view")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const view = ((VIEWS as readonly string[]).includes(url.searchParams.get("view") ?? "") ? url.searchParams.get("view") : "class") as View;
  const t = await enrolmentTable(view);
  return tableReport({ title: t.title, subtitle: t.subtitle, filename: `enrolment-${view}`, landscape: view === "age" || view === "residence", columns: t.columns, rows: t.rows, totals: t.totals }, url.searchParams.get("format"), user);
}
