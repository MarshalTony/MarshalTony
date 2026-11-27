"use client";
import * as React from "react";
import { ActionForm } from "./forms";
import { SaveBar } from "./save-bar";
import { useDraft } from "./use-draft";
import type { ActionResult } from "@/server/action";
import { norm } from "@/lib/drafts";

type Row = { id: string; admissionNo: string; name: string; value: string };

function check(v: string, max: number): string | null {
  const t = v.trim().toUpperCase();
  if (t === "" || ["ABS", "A", "ABSENT", "EX", "X", "EXEMPT", "EXEMPTED"].includes(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return "Not a number";
  if (n < 0) return "Negative";
  if (n > max) return `> ${max}`;
  return null;
}

/**
 * Exam marks for one stream × subject (× paper). Typed marks are kept on the device until saved (lost connection,
 * closed tab…); the save bar stays at the bottom of the screen; on phones the boxes are bigger and an ABS button
 * stands in for the letters the number keypad does not have.
 */
export function MarksGrid({
  action, rows, max, hidden, readOnly, correction,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  rows: Row[]; max: number; hidden: Record<string, string>; readOnly: boolean; correction: boolean;
}) {
  const server = React.useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r.value])), [rows]);
  const key = `smis-draft:marks:${JSON.stringify(hidden)}`;
  const { values, set, unsaved, notice, discard } = useDraft(key, server);
  const errors = Object.entries(values).filter(([, v]) => check(v, max));
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;
  const numeric = Object.values(values).filter((v) => v.trim() !== "" && Number.isFinite(Number(v))).map(Number);
  const avg = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0;
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  return (
    <ActionForm action={action} hideSubmit>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {notice && !readOnly && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={discard} className="text-xs font-medium underline">Throw them away</button>
        </div>
      )}
      {correction && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <label className="text-sm font-medium text-amber-900" htmlFor="reason">Reason for correction (recorded in the audit log)</label>
          <input id="reason" name="reason" required className="mt-1 h-9 w-full rounded border border-amber-300 px-2 text-sm" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{filled} / {rows.length} entered</span>
        <span>Class average: <b>{numeric.length ? avg.toFixed(1) : "—"}</b> / {max}</span>
        {errors.length > 0 && <span className="font-medium text-red-700">{errors.length} invalid</span>}
        <span className="text-xs">Type a mark, <b>ABS</b> (absent) or <b>EX</b> (exempted). Enter ↵ moves down.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-2 text-left">#</th><th className="hidden p-2 text-left sm:table-cell">Adm. No.</th><th className="p-2 text-left">Student</th><th className="p-2 text-left">Mark / {max}</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = values[r.id] ?? "";
              const err = check(v, max);
              const changed = norm(server[r.id] ?? "") !== norm(v);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-400">{i + 1}</td>
                  <td className="hidden p-2 font-mono text-xs sm:table-cell">{r.admissionNo}</td>
                  <td className="p-2 leading-tight">{r.name}<span className="block font-mono text-[11px] text-slate-500 sm:hidden">{r.admissionNo}</span></td>
                  <td className="whitespace-nowrap p-1.5">
                    <input
                      ref={(el) => { refs.current[i] = el; }}
                      name={`m_${r.id}`}
                      value={v}
                      disabled={readOnly}
                      inputMode="decimal"
                      enterKeyHint={i < rows.length - 1 ? "next" : "done"}
                      autoComplete="off"
                      aria-label={`Mark for ${r.name}`}
                      aria-invalid={!!err}
                      onChange={(e) => set(r.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); refs.current[i + 1]?.focus(); }
                        if (e.key === "ArrowUp") { e.preventDefault(); refs.current[i - 1]?.focus(); }
                      }}
                      className={`h-11 w-20 rounded border px-2 text-right text-base sm:h-8 sm:w-24 sm:text-sm ${err ? "border-red-500 bg-red-50" : changed ? "border-amber-400 bg-amber-50/60" : "border-slate-300"} disabled:bg-slate-100`}
                    />
                    {!readOnly && (
                      <button type="button" onClick={() => { set(r.id, v.toUpperCase() === "ABS" ? "" : "ABS"); refs.current[i + 1]?.focus(); }}
                        className={`ml-1.5 h-11 rounded border px-2 text-xs font-semibold sm:hidden ${v.toUpperCase() === "ABS" ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 text-slate-600"}`}
                        aria-label={`Mark ${r.name} absent`}>ABS</button>
                    )}
                    {err && <span className="ml-1 text-xs text-red-600">{err}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && <SaveBar unsaved={unsaved} disabled={errors.length > 0} variant={correction ? "destructive" : "default"} label={correction ? "Save corrections" : "Save marks"} />}
    </ActionForm>
  );
}
