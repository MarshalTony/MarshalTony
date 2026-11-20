import { getCurrentUser, can } from "@/server/auth";
import { IMPORT_KINDS, columnsOf } from "@/server/imports/kinds";
import { buildTemplate } from "@/server/imports/excel";
import { xlsxResponse } from "@/server/http";

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const def = IMPORT_KINDS[kind];
  const user = await getCurrentUser();
  if (!def) return new Response("Not found", { status: 404 });
  if (!user || !can(user, ...def.permission)) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const ctx: Record<string, string> = {};
  for (const k of def.contextKeys ?? []) {
    const v = url.searchParams.get(k);
    if (!v) return new Response(`Missing ${k}`, { status: 400 });
    ctx[k] = v;
  }
  const rows = def.templateRows ? await def.templateRows(ctx) : [];
  const buf = await buildTemplate(def.title, await columnsOf(def, ctx), rows, def.instructions);
  return xlsxResponse(buf, `${kind}-template.xlsx`);
}
