import type { Tx } from "@/lib/db";

/** Atomically increments a named counter inside the caller's transaction. */
export async function nextNumber(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return rows[0].value;
}

export async function nextDocNo(tx: Tx, prefix: string, year = new Date().getFullYear(), pad = 6) {
  const n = await nextNumber(tx, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(n).padStart(pad, "0")}`;
}
