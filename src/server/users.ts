import "server-only";
import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";

/** Lower-case letters, digits and dots; e.g. "Peter", "Okello" → "peter.okello". */
export function usernameBase(first: string, last: string) {
  return `${first}.${last}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9.]/g, "").replace(/\.+/g, ".").replace(/^\.|\.$/g, "").slice(0, 30) || "user";
}

/** First free username starting from `base` (base, base2, base3…). `taken` lets a batch avoid names it is about to create. */
export async function uniqueUsername(base: string, db: Tx = prisma, taken: Set<string> = new Set()) {
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 36) || "user";
  let name = clean;
  for (let i = 2; taken.has(name) || (await db.user.findUnique({ where: { username: name }, select: { id: true } })); i++) name = `${clean}${i}`;
  return name;
}
