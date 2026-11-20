"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { action, zs, UserError } from "../action";
import { can } from "../auth";
import { audit } from "../audit";
import { readSheet } from "../imports/excel";
import { IMPORT_KINDS, columnsOf, type Ctx } from "../imports/kinds";
import { fileFrom } from "../storage";

export const uploadImport = action(
  { permission: null, schema: z.object({ kind: z.string(), examId: zs.optId(), streamId: zs.optId(), subjectId: zs.optId(), termId: zs.optId(), paper: zs.optId() }) },
  async ({ kind, ...ctxRaw }, user, fd) => {
    const def = IMPORT_KINDS[kind];
    if (!def) throw new UserError("Unknown import type.");
    if (!can(user, ...def.permission)) throw new UserError("You are not allowed to perform this import.");
    const ctx: Ctx = {};
    for (const k of def.contextKeys ?? []) {
      const v = (ctxRaw as Record<string, string | null>)[k];
      if (!v) throw new UserError(`Missing ${k}.`);
      ctx[k] = v;
    }
    const file = fileFrom(fd, "file");
    if (!file) throw new UserError("Choose an Excel (.xlsx) file.");
    if (file.size > 5 * 1024 * 1024) throw new UserError("File is too large (max 5 MB).");
    let rows;
    try {
      rows = await readSheet(await file.arrayBuffer(), await columnsOf(def, ctx));
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Could not read the file.");
    }
    if (rows.length === 0) throw new UserError("The file has no data rows.");
    const checked = await def.check(rows, ctx);
    const errors = checked.filter((r) => r.errors.length).map((r) => ({ rowNumber: r.rowNumber, values: r.values, errors: r.errors }));
    const batch = await prisma.importBatch.create({
      data: {
        kind, fileName: file.name.slice(0, 200), context: ctx, rows: rows as any, errors: errors as any,
        validCount: checked.length - errors.length, errorCount: errors.length, createdById: user.id,
      },
    });
    await audit(user.id, "IMPORT_PREVIEW", "ImportBatch", batch.id, { kind, rows: rows.length, errors: errors.length });
    return { ok: true, message: `File checked: ${batch.validCount} valid, ${batch.errorCount} with errors.`, redirect: `/imports/${batch.id}` };
  },
);

export const commitImport = action(
  { permission: null, schema: z.object({ batchId: zs.id(), acknowledge: zs.bool() }) },
  async ({ batchId, acknowledge }, user) => {
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    const def = IMPORT_KINDS[batch.kind];
    if (!def || !can(user, ...def.permission)) throw new UserError("You are not allowed to perform this import.");
    if (batch.createdById !== user.id && !user.roles.includes("ADMIN")) throw new UserError("Only the person who uploaded this file can confirm it.");
    if (batch.status !== "PREVIEW") throw new UserError(`This import was already ${batch.status.toLowerCase()}.`);
    // Re-validate against the database as it is NOW.
    const checked = await def.check(batch.rows as any, batch.context as Ctx);
    const valid = checked.filter((r) => r.errors.length === 0);
    const invalid = checked.length - valid.length;
    if (invalid > 0 && !acknowledge) throw new UserError(`${invalid} row(s) have errors. Tick the confirmation to import only the valid rows, or fix the file and upload again.`);
    if (valid.length === 0) throw new UserError("There are no valid rows to import.");
    const message = await prisma.$transaction((tx) => def.commit(tx, valid, batch.context as Ctx, user), { timeout: 120_000 });
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "COMMITTED", committedAt: new Date(), validCount: valid.length, errorCount: invalid } });
    await audit(user.id, "IMPORT_COMMIT", "ImportBatch", batchId, { kind: batch.kind, imported: valid.length, skipped: invalid });
    return { ok: true, message: invalid ? `${message} ${invalid} invalid row(s) were NOT imported — download the error report.` : message };
  },
);

export const cancelImport = action(
  { permission: null, schema: z.object({ batchId: zs.id() }) },
  async ({ batchId }, user) => {
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.createdById !== user.id && !user.roles.includes("ADMIN")) throw new UserError("Not allowed.");
    if (batch.status !== "PREVIEW") throw new UserError("Already processed.");
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "CANCELLED" } });
    return { ok: true, message: "Import cancelled. Nothing was saved.", redirect: "/imports" };
  },
);
