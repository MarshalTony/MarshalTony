import { prisma, type Tx } from "@/lib/db";
import { clientInfo } from "./request";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
  tx: Tx = prisma,
) {
  let ip: string | null = null;
  try {
    ip = (await clientInfo()).ip;
  } catch {
    // outside a request (scripts/tests)
  }
  await tx.auditLog.create({
    data: { userId, action, entity, entityId: entityId ?? null, details: (details ?? undefined) as any, ip },
  });
}
