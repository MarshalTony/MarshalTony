import "server-only";
import ExcelJS from "exceljs";

export type Column = { key: string; header: string; required?: boolean; example?: string; note?: string; options?: string[] };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Reads the first worksheet; row 1 = headers (matched loosely to column headers or keys). */
export async function readSheet(buf: ArrayBuffer, columns: Column[]) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new Error("The file is not a valid Excel (.xlsx) workbook.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no worksheets.");
  const headerRow = ws.getRow(1);
  const colIndex = new Map<string, number>();
  headerRow.eachCell((cell, idx) => {
    const h = norm(cellText(cell.value).replace(/\*$/, ""));
    const col = columns.find((c) => norm(c.header) === h || norm(c.key) === h);
    if (col) colIndex.set(col.key, idx);
  });
  const missing = columns.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}. Download the template and keep its header row.`);
  const rows: { rowNumber: number; values: Record<string, string> }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    let any = false;
    for (const [key, idx] of colIndex) {
      const t = cellText(row.getCell(idx).value);
      values[key] = t;
      if (t) any = true;
    }
    if (any) rows.push({ rowNumber, values });
  });
  if (rows.length > 5000) throw new Error("Too many rows (maximum 5,000 per file). Split the file.");
  return rows;
}

export async function buildTemplate(title: string, columns: Column[], rows: Record<string, string | number>[] = [], instructions: string[] = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bishop Ogez SMIS";
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.required ? `${c.header}*` : c.header, key: c.key, width: Math.max(14, c.header.length + 4) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  const last = Math.max(rows.length + 200, 500);
  columns.forEach((c, i) => {
    if (!c.options?.length) return;
    const letter = ws.getColumn(i + 1).letter;
    for (let r = 2; r <= last; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = { type: "list", allowBlank: !c.required, formulae: [`"${c.options.join(",")}"`] };
    }
  });
  const help = wb.addWorksheet("Instructions");
  help.getColumn(1).width = 28;
  help.getColumn(2).width = 90;
  help.addRow(["Bishop Ogez High School — " + title]).font = { bold: true, size: 14 };
  for (const line of instructions) help.addRow([line]);
  help.addRow([]);
  help.addRow(["Column", "Meaning / allowed values"]).font = { bold: true };
  for (const c of columns) help.addRow([`${c.header}${c.required ? " (required)" : ""}`, [c.note, c.options ? `One of: ${c.options.join(", ")}` : "", c.example ? `Example: ${c.example}` : ""].filter(Boolean).join(" · ")]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildErrorReport(columns: Column[], rows: { rowNumber: number; values: Record<string, string>; errors: string[] }[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.columns = [{ header: "Row", key: "_row", width: 8 }, { header: "Errors", key: "_errors", width: 60 }, ...columns.map((c) => ({ header: c.header, key: c.key, width: 16 }))];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ _row: r.rowNumber, _errors: r.errors.join("; "), ...r.values });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---- value parsers returning [value, error] ----
export function parseDate(s: string): Date | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (Uganda)
  if (m) return ymd(+m[3], +m[2], +m[1]);
  return null;
}
/** Rejects impossible dates such as 31/31/2020 or 30/02/2024 (JS would silently roll them over). */
function ymd(y: number, mo: number, d: number) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || y > 2100) return null;
  return date;
}
export function parseGender(s: string): "MALE" | "FEMALE" | null {
  const v = s.trim().toUpperCase();
  if (["M", "MALE", "BOY"].includes(v)) return "MALE";
  if (["F", "FEMALE", "GIRL"].includes(v)) return "FEMALE";
  return null;
}
export function parseNumber(s: string): number | null {
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
