import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { IMPORT_KINDS, columnsOf } from "@/server/imports/kinds";
import { buildErrorReport } from "@/server/imports/excel";
import { xlsxResponse } from "@/server/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!user || !batch || (batch.createdById !== user.id && !user.roles.includes("ADMIN"))) return new Response("Not found", { status: 404 });
  const def = IMPORT_KINDS[batch.kind];
  const columns = def ? await columnsOf(def, (batch.context ?? {}) as Record<string, string>).catch(() => def.columns) : [];
  const buf = await buildErrorReport(columns, batch.errors as any);
  return xlsxResponse(buf, `import-errors-${id.slice(-6)}.xlsx`);
}
