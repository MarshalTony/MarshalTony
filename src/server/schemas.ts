import { z } from "zod";

/** Schema pieces with callbacks live here: "use server" files may only contain async functions. */
export const upperOpt = (max = 30) => z.string().trim().max(max).optional().transform((v) => (v ? v.toUpperCase() : undefined));
export const optNumber = () => z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().min(0).optional());

export const bandsField = z.string().transform((s, ctx) => {
  // One band per line: GRADE, MIN, MAX, POINTS, REMARK
  const rows = s.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = rows.map((line, i) => {
    const [main, ...desc] = line.split("|");
    const [grade, min, max, points, ...remark] = main.split(",").map((x) => x.trim());
    const b = { grade, minScore: Number(min), maxScore: Number(max), points: Number(points), remark: remark.join(", "), description: desc.join("|").trim() || null };
    if (!grade || [b.minScore, b.maxScore, b.points].some((n) => !Number.isFinite(n)) || b.minScore > b.maxScore || b.minScore < 0 || b.maxScore > 100) {
      ctx.addIssue({ code: "custom", message: `Line ${i + 1} is invalid: "${line}"` });
    }
    return b;
  });
  if (!out.length) ctx.addIssue({ code: "custom", message: "Add at least one band" });
  return out;
});

export const divisionsField = z.string().optional().transform((s, ctx) =>
  (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const [label, min, max] = line.split(",").map((x) => x.trim());
    const d = { label, min: Number(min), max: Number(max) };
    if (!label || !Number.isFinite(d.min) || !Number.isFinite(d.max)) ctx.addIssue({ code: "custom", message: `Division line ${i + 1} is invalid` });
    return d;
  }),
);

/** Fee lines, one per line: "Name, amount" (amount may contain commas as thousands separators at the end). */
export const feeLinesField = z.string().transform((s, ctx) => {
  const out = s.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const m = line.match(/^(.+?)[,\t:]\s*([\d,. ]+)$/);
    const amount = m ? Number(m[2].replace(/[ ,]/g, "")) : NaN;
    if (!m || !Number.isFinite(amount) || amount <= 0) ctx.addIssue({ code: "custom", message: `Line ${i + 1} must look like "Tuition, 800000"` });
    return { name: m ? m[1].trim().slice(0, 100) : line, amount };
  });
  if (!out.length) ctx.addIssue({ code: "custom", message: "Add at least one fee item" });
  return out;
});

/** PO items, one per line: "Description, quantity, unit price". */
export const poItemsField = z.string().transform((s, ctx) => {
  const out = s.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const parts = line.split(",").map((x) => x.trim());
    const unitPrice = Number((parts.pop() ?? "").replace(/\s/g, ""));
    const quantity = Number(parts.pop() ?? "");
    const description = parts.join(", ");
    if (!description || !(quantity > 0) || !(unitPrice >= 0)) ctx.addIssue({ code: "custom", message: `Line ${i + 1} must look like "Exercise books, 200, 1500"` });
    return { description: description.slice(0, 200), quantity, unitPrice };
  });
  if (!out.length) ctx.addIssue({ code: "custom", message: "Add at least one item" });
  return out;
});

export const optUrl = z.string().trim().url().optional().or(z.literal("").transform(() => undefined));

export const nonZeroNumber = z.coerce.number().refine((n) => n !== 0, "Quantity cannot be zero");

/** A-Level combination category (Arts / Sciences); empty = not set. */
export const optCombinationCategory = () =>
  z.enum(["ARTS", "SCIENCES"]).or(z.literal("")).optional().transform((v) => (v ? v : null));
