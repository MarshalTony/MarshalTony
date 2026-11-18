"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import type { ActionResult } from "@/server/action";
import { activityAverage, bandFor, validActivityScore, type Band } from "@/lib/cbc";

type Row = { id: string; admissionNo: string; name: string; scores: Record<string, string>; remark: string };

export function ActivityGrid({
  action, activities, rows, bands, hidden, readOnly,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  activities: { id: string; title: string }[]; rows: Row[]; bands: Band[]; hidden: Record<string, string>; readOnly: boolean;
}) {
  const [vals, setVals] = React.useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const r of rows) for (const a of activities) v[`${a.id}_${r.id}`] = r.scores[a.id] ?? "";
    return v;
  });
  const invalid = Object.values(vals).filter((x) => validActivityScore(x) === "invalid").length;
  const filled = Object.values(vals).filter((x) => x.trim() !== "").length;
  const total = rows.length * activities.length;
  const refs = React.useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <ActionForm action={action} hideSubmit>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>{filled} / {total} scores entered</span>
        {invalid > 0 && <span className="font-medium text-red-700">{invalid} invalid (must be 0–3)</span>}
        <span className="text-xs">Score each chapter out of 3 (one decimal, e.g. 2.5). Leave blank if not assessed. Enter ↵ moves down.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Learner</th>
              {activities.map((a, i) => <th key={a.id} className="min-w-[90px] p-2 text-center normal-case">{i + 1}. {a.title}<span className="block text-[10px] uppercase text-slate-400">/ 3</span></th>)}
              <th className="p-2 text-center">Avg</th>
              <th className="p-2 text-center">Idf</th>
              <th className="min-w-[200px] p-2 text-left">Competency remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const nums = activities.map((a) => validActivityScore(vals[`${a.id}_${r.id}`] ?? "")).map((x) => (typeof x === "number" ? x : null));
              const avg = activityAverage(nums);
              const band = bandFor(avg, bands);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-2 text-slate-400">{ri + 1}</td>
                  <td className="p-2">{r.name}<span className="block font-mono text-[11px] text-slate-500">{r.admissionNo}</span></td>
                  {activities.map((a, ai) => {
                    const key = `${a.id}_${r.id}`;
                    const bad = validActivityScore(vals[key] ?? "") === "invalid";
                    return (
                      <td key={a.id} className="p-1 text-center">
                        <input
                          ref={(el) => { refs.current[`${ai}:${ri}`] = el; }}
                          name={`s_${key}`}
                          value={vals[key] ?? ""}
                          disabled={readOnly}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${a.title} score for ${r.name}`}
                          aria-invalid={bad}
                          onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); refs.current[`${ai}:${ri + 1}`]?.focus(); }
                            if (e.key === "ArrowUp") { e.preventDefault(); refs.current[`${ai}:${ri - 1}`]?.focus(); }
                          }}
                          className={`h-8 w-16 rounded border px-2 text-center ${bad ? "border-red-500 bg-red-50" : "border-slate-300"} disabled:bg-slate-100`}
                        />
                      </td>
                    );
                  })}
                  <td className="p-2 text-center font-medium">{avg ?? "—"}</td>
                  <td className="p-2 text-center" title={band?.remark}>{band ? <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-800">{band.grade}</span> : "—"}</td>
                  <td className="p-1"><input name={`r_${r.id}`} defaultValue={r.remark} disabled={readOnly} maxLength={200} placeholder="e.g. can present and critique the text" className="h-8 w-full rounded border border-slate-300 px-2 text-xs disabled:bg-slate-100" aria-label={`Remark for ${r.name}`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && <div className="flex justify-end"><SubmitButton disabled={invalid > 0}>Save scores & remarks</SubmitButton></div>}
    </ActionForm>
  );
}
