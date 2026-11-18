import zlib from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, can } from "@/server/auth";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Full logical export (every table as JSON, gzipped). Excludes session and reset tokens. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user, "backup.manage")) return new Response("Forbidden", { status: 403 });
  const skip = new Set(["Session", "PasswordResetToken"]);
  const data: Record<string, unknown[]> = {};
  for (const m of Prisma.dmmf.datamodel.models) {
    if (skip.has(m.name)) continue;
    const delegate = (prisma as any)[m.name.charAt(0).toLowerCase() + m.name.slice(1)];
    data[m.name] = await delegate.findMany();
  }
  // Binary columns (stored files) are exported as base64 instead of JSON number arrays.
  const json = JSON.stringify({ format: "smis-export-v1", exportedAt: new Date().toISOString(), data }, (_k, v) =>
    v instanceof Uint8Array ? { base64: Buffer.from(v).toString("base64") } : v);
  const body = zlib.gzipSync(json);
  await audit(user.id, "BACKUP_DOWNLOAD", "Database", null, { tables: Object.keys(data).length, bytes: body.length });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="smis-export-${stamp}.json.gz"`, "Cache-Control": "no-store" },
  });
}
