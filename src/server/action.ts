import "server-only";
import { z, ZodError, type ZodTypeAny } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { PermissionCode } from "@/lib/permissions";
import { AuthError, requireUser, type CurrentUser } from "./auth";

export type ActionResult<T = unknown> = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
  redirect?: string;
};

export class UserError extends Error {}

/** Converts FormData to a plain object; repeated keys become arrays; "" → undefined. */
export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = fd.getAll(key).filter((v) => !(v instanceof File)) as string[];
    if (key.endsWith("[]")) out[key.slice(0, -2)] = all.filter((v) => v !== "");
    else {
      const v = all[all.length - 1];
      out[key] = v === "" || v === undefined ? undefined : v;
    }
  }
  return out;
}

export function describeError(e: unknown): ActionResult {
  if (e instanceof AuthError || e instanceof UserError) return { ok: false, error: e.message };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    const first = e.issues[0];
    return { ok: false, error: `${first.path.join(".") || "Input"}: ${first.message}`, fieldErrors };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "value";
      return { ok: false, error: `A record with this ${target} already exists.` };
    }
    if (e.code === "P2003") return { ok: false, error: "This record is linked to other records and cannot be removed." };
    if (e.code === "P2025") return { ok: false, error: "Record not found." };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("immutable")) return { ok: false, error: "Completed financial records cannot be changed. Use a reversal or adjustment." };
  console.error("[action error]", e);
  return { ok: false, error: "Something went wrong. The error has been logged." };
}

type Handler<S extends ZodTypeAny, T> = (input: z.infer<S>, user: CurrentUser, raw: FormData) => Promise<ActionResult<T> | void>;

/**
 * Wraps a server action with: authentication, server-side permission check,
 * Zod validation, error mapping, and optional path revalidation.
 */
export function action<S extends ZodTypeAny, T = unknown>(
  opts: { permission: PermissionCode | PermissionCode[] | null; schema: S; revalidate?: string | string[] },
  handler: Handler<S, T>,
) {
  return async (_prev: ActionResult | null, fd: FormData): Promise<ActionResult<T>> => {
    try {
      const perms = opts.permission === null ? [] : Array.isArray(opts.permission) ? opts.permission : [opts.permission];
      const user = await requireUser(...perms);
      const input = opts.schema.parse(formToObject(fd));
      const result = (await handler(input, user, fd)) ?? { ok: true, message: "Saved." };
      if (opts.revalidate) for (const p of [opts.revalidate].flat()) revalidatePath(p);
      return result as ActionResult<T>;
    } catch (e) {
      return describeError(e) as ActionResult<T>;
    }
  };
}

// ---- Reusable Zod field helpers (FormData values are strings) ----
export const zs = {
  str: (max = 200) => z.string().trim().min(1, "Required").max(max),
  optStr: (max = 500) => z.string().trim().max(max).optional().transform((v) => (v ? v : null)),
  int: () => z.coerce.number().int(),
  optInt: () => z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().int().optional()),
  money: () => z.coerce.number({ invalid_type_error: "Enter an amount" }).finite().min(0).max(1_000_000_000),
  positiveMoney: () => z.coerce.number({ invalid_type_error: "Enter an amount" }).finite().gt(0, "Must be more than 0").max(1_000_000_000),
  date: () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").transform((s) => new Date(`${s}T00:00:00.000Z`)),
  optDate: () =>
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional().transform((s) => (s ? new Date(`${s}T00:00:00.000Z`) : null)),
  bool: () => z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean()),
  id: () => z.string().min(1, "Required").max(40),
  optId: () => z.string().max(40).optional().transform((v) => (v ? v : null)),
  ids: () => z.array(z.string().max(40)).default([]),
  phone: () => z.string().trim().regex(/^\+?[0-9 ()-]{9,20}$/, "Invalid phone number"),
  optPhone: () =>
    z.string().trim().regex(/^\+?[0-9 ()-]{9,20}$/, "Invalid phone number").optional().transform((v) => (v ? v : null)),
  email: () => z.string().trim().toLowerCase().email().optional().transform((v) => (v ? v : null)),
};
