"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import { Button } from "./ui/button";
import { QUICK_COLUMNS, parsePasted, parseResidence, parseSex, type QuickRow } from "@/lib/quick-register";
import type { ActionResult } from "@/server/action";

type Opt = { value: string; label: string };
const blank = (): QuickRow => ({ lastName: "", firstName: "", otherNames: "", gender: "", residence: "", dateOfBirth: "", linNumber: "", houseId: "", combinationId: "", guardianName: "", guardianPhone: "" });
const many = (n: number) => Array.from({ length: n }, blank);
const cell = "h-7 w-full min-w-0 rounded border border-slate-300 px-1.5 text-xs focus:border-brand-500 focus:outline-none";
const sel = "h-7 rounded border border-slate-300 bg-white px-1 text-xs";

const HEAD: Record<(typeof QUICK_COLUMNS)[number], string> = {
  lastName: "Surname *", firstName: "First name *", otherNames: "Other names", gender: "Sex *", residence: "Day/Brd",
  dateOfBirth: "Date of birth", linNumber: "LIN", guardianName: "Parent name", guardianPhone: "Parent phone",
};

/**
 * Grid for registering many students of one class at once. Type, or copy cells from Excel and paste into any cell:
 * the block fills the rows and columns from there (columns in this order: Surname, First name, Other names, Sex,
 * Day/Boarding, Date of birth, LIN, Parent name, Parent phone).
 */
export function QuickRegisterGrid({
  action, classId, streamId, houses, combinations, today,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  classId: string; streamId: string; houses: Opt[]; combinations: Opt[] | null; today: string;
}) {
  const [rows, setRows] = React.useState<QuickRow[]>(many(10));
  const [defaults, setDefaults] = React.useState({ residence: "DAY", houseId: "" });
  const filled = rows.filter((r) => r.lastName.trim() || r.firstName.trim());
  const set = (i: number, patch: Partial<QuickRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function paste(e: React.ClipboardEvent<HTMLInputElement>, i: number, col: number) {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text)) return; // ordinary paste into one cell
    e.preventDefault();
    const block = parsePasted(text);
    setRows((rs) => {
      const out = [...rs];
      while (out.length < i + block.length) out.push(blank());
      block.forEach((cells, k) => {
        const r = { ...out[i + k] };
        cells.forEach((v, c) => {
          const key = QUICK_COLUMNS[col + c];
          if (!key) return;
          // Sex and day/boarding are shown as choices: tidy "m", "Female", "b"… straight away.
          r[key] = key === "gender" ? parseSex(v) : key === "residence" ? (v.trim() ? parseResidence(v) : "") : v.trim();
        });
        out[i + k] = r;
      });
      return out;
    });
  }

  const payload = filled.map((r) => ({ ...r, residence: r.residence || defaults.residence, houseId: r.houseId || defaults.houseId }));
  return (
    <ActionForm action={action} hideSubmit resetOnSuccess onSuccess={() => setRows(many(10))}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="streamId" value={streamId} />
      <input type="hidden" name="rows" value={JSON.stringify(payload)} />
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
        <label className="space-y-0.5"><span className="block text-xs text-slate-500">Admission date</span><input type="date" name="admissionDate" defaultValue={today} required className={`${cell} w-36`} /></label>
        <label className="space-y-0.5"><span className="block text-xs text-slate-500">Day/boarding when blank</span>
          <select className={sel} value={defaults.residence} onChange={(e) => setDefaults({ ...defaults, residence: e.target.value })}><option value="DAY">Day</option><option value="BOARDING">Boarding</option></select>
        </label>
        {houses.length > 0 && (
          <label className="space-y-0.5"><span className="block text-xs text-slate-500">House when blank</span>
            <select className={sel} value={defaults.houseId} onChange={(e) => setDefaults({ ...defaults, houseId: e.target.value })}><option value="">No house (share out later)</option>{houses.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select>
          </label>
        )}
        <label className="flex items-center gap-1.5 self-center text-xs"><input type="checkbox" name="allowDuplicates" value="true" />Register even if the name already exists in the class</label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span><b>{filled.length}</b> student{filled.length === 1 ? "" : "s"} to register</span>
        <span className="text-xs text-slate-500">Tip: copy the columns from Excel (Surname, First name, Other names, Sex, Day/Boarding, Date of birth, LIN, Parent name, Parent phone) and paste into the first Surname cell.</span>
        <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, ...many(10)])}>Add 10 rows</Button>
          <Button type="button" size="sm" variant="outline" disabled={!filled.length} onClick={() => setRows(many(10))}>Clear</Button>
          <SubmitButton size="sm" disabled={!filled.length} pendingText="Registering…">Register {filled.length || ""} student{filled.length === 1 ? "" : "s"}</SubmitButton>
        </span>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="p-1.5 text-right">#</th>
              {QUICK_COLUMNS.map((k) => <th key={k} className="p-1.5 text-left">{HEAD[k]}</th>)}
              {houses.length > 0 && <th className="p-1.5 text-left">House</th>}
              {combinations && <th className="p-1.5 text-left">Combination</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-1 text-right text-slate-400">{i + 1}</td>
                {QUICK_COLUMNS.map((k, c) => (
                  <td key={k} className="p-1">
                    {k === "gender" ? (
                      <select aria-label={`Row ${i + 1} sex`} className={sel} value={r.gender} onChange={(e) => set(i, { gender: e.target.value })}>
                        <option value="">—</option><option value="MALE">M</option><option value="FEMALE">F</option>
                        {r.gender && !["MALE", "FEMALE"].includes(r.gender) && <option value={r.gender}>{r.gender}</option>}
                      </select>
                    ) : k === "residence" ? (
                      <select aria-label={`Row ${i + 1} day or boarding`} className={sel} value={r.residence} onChange={(e) => set(i, { residence: e.target.value })}>
                        <option value="">{defaults.residence === "DAY" ? "(Day)" : "(Brd)"}</option><option value="DAY">Day</option><option value="BOARDING">Boarding</option>
                        {r.residence && !["DAY", "BOARDING"].includes(r.residence) && <option value={r.residence}>{r.residence}</option>}
                      </select>
                    ) : (
                      <input
                        aria-label={`Row ${i + 1} ${HEAD[k].replace(" *", "")}`}
                        className={`${cell} ${k === "lastName" || k === "firstName" || k === "guardianName" ? "w-28" : k === "dateOfBirth" ? "w-24" : "w-24"}`}
                        placeholder={k === "dateOfBirth" ? "DD/MM/YYYY" : k === "guardianPhone" ? "07…" : ""}
                        value={r[k]} onChange={(e) => set(i, { [k]: e.target.value })} onPaste={(e) => paste(e, i, c)}
                      />
                    )}
                  </td>
                ))}
                {houses.length > 0 && (
                  <td className="p-1"><select aria-label={`Row ${i + 1} house`} className={sel} value={r.houseId} onChange={(e) => set(i, { houseId: e.target.value })}><option value="">—</option>{houses.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}</select></td>
                )}
                {combinations && (
                  <td className="p-1"><select aria-label={`Row ${i + 1} combination`} className={sel} value={r.combinationId} onChange={(e) => set(i, { combinationId: e.target.value })}><option value="">—</option>{combinations.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
