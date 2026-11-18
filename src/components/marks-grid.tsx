"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import type { ActionResult } from "@/server/action";

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

export function MarksGrid({
  action, rows, max, hidden, readOnly, correction,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  rows: Row[]; max: number; hidden: Record<string, string>; readOnly: boolean; correction: boolean;
}) {
  const [values, setValues] = React.useState(() => Object.fromEntries(rows.map((r) => [r.id, r.value])));
  const errors = Object.entries(values).filter(([, v]) => check(v, max));
  const filled = Object.values(values).filter((v) => v.trim() !== "").length;
  const numeric = Object.values(values).filter((v) => v.trim() !== "" && Number.isFinite(Number(v))).map(Number);
  const avg = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0;
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  return (
    <ActionForm action={action} hideSubmit>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {correction && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <label className="text-sm font-medium text-amber-900" htmlFor="reason">Reason for correction (recorded in the audit log)</label>
          <input id="reason" name="reason" required className="mt-1 h-9 w-full rounded border border-amber-300 px-2 text-sm" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>{filled} / {rows.length} entered</span>
        <span>Class average: <b>{numeric.length ? avg.toFixed(1) : "—"}</b> / {max}</span>
        {errors.length > 0 && <span className="font-medium text-red-700">{errors.length} invalid</span>}
        <span className="text-xs">Type a mark, <b>ABS</b> (absent) or <b>EX</b> (exempted). Enter ↵ moves down.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Adm. No.</th><th className="p-2 text-left">Student</th><th className="w-32 p-2 text-left">Mark / {max}</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const err = check(values[r.id] ?? "", max);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-400">{i + 1}</td>
                  <td className="p-2 font-mono text-xs">{r.admissionNo}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-1.5">
                    <input
                      ref={(el) => { refs.current[i] = el; }}
                      name={`m_${r.id}`}
                      value={values[r.id] ?? ""}
                      disabled={readOnly}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Mark for ${r.name}`}
                      aria-invalid={!!err}
                      onChange={(e) => setValues({ ...values, [r.id]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); refs.current[i + 1]?.focus(); }
                        if (e.key === "ArrowUp") { e.preventDefault(); refs.current[i - 1]?.focus(); }
                      }}
                      className={`h-8 w-24 rounded border px-2 text-right ${err ? "border-red-500 bg-red-50" : "border-slate-300"} disabled:bg-slate-100`}
                    />
                    {err && <span className="ml-1 text-xs text-red-600">{err}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex justify-end">
          <SubmitButton disabled={errors.length > 0} variant={correction ? "destructive" : "default"}>{correction ? "Save corrections" : "Save marks"}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
