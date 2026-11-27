"use client";
import * as React from "react";
import { ActionForm } from "./forms";
import { SaveBar } from "./save-bar";
import { useDraft } from "./use-draft";
import type { ActionResult } from "@/server/action";
import { activityAverage, bandFor, validActivityScore, type Band } from "@/lib/cbc";
import { norm } from "@/lib/drafts";

type Row = { id: string; admissionNo: string; name: string; scores: Record<string, string>; remark: string };

/**
 * Activities of Integration scores (out of 3) and competency remarks for one stream × subject. Unsaved work is kept on
 * the device until saved; the learner column stays visible when scrolling sideways; the save bar stays in reach.
 */
export function ActivityGrid({
  action, activities, rows, bands, hidden, readOnly,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  activities: { id: string; title: string }[]; rows: Row[]; bands: Band[]; hidden: Record<string, string>; readOnly: boolean;
}) {
  // Cells: "s:<activityId>_<studentId>" for scores, "r:<studentId>" for remarks.
  const server = React.useMemo(() => {
    const v: Record<string, string> = {};
    for (const r of rows) {
      for (const a of activities) v[`s:${a.id}_${r.id}`] = r.scores[a.id] ?? "";
      v[`r:${r.id}`] = r.remark ?? "";
    }
    return v;
  }, [rows, activities]);
  const key = `smis-draft:activities:${JSON.stringify(hidden)}:${activities.map((a) => a.id).join(",")}`;
  const { values: vals, set, unsaved, notice, discard } = useDraft(key, server);
  const scoreKeys = Object.keys(vals).filter((k) => k.startsWith("s:"));
  const invalid = scoreKeys.filter((k) => validActivityScore(vals[k]) === "invalid").length;
  const filled = scoreKeys.filter((k) => vals[k].trim() !== "").length;
  const total = rows.length * activities.length;
  const refs = React.useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <ActionForm action={action} hideSubmit>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {notice && !readOnly && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={discard} className="text-xs font-medium underline">Throw them away</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{filled} / {total} scores entered</span>
        {invalid > 0 && <span className="font-medium text-red-700">{invalid} invalid (must be 0–3)</span>}
        <span className="text-xs">Score each chapter out of 3 (one decimal, e.g. 2.5). Leave blank if not assessed. Enter ↵ moves down.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="hidden p-2 text-left sm:table-cell">#</th>
              <th className="sticky left-0 z-10 bg-slate-50 p-2 text-left">Learner</th>
              {activities.map((a, i) => <th key={a.id} className="min-w-[80px] p-2 text-center normal-case">{i + 1}. {a.title}<span className="block text-[10px] uppercase text-slate-400">/ 3</span></th>)}
              <th className="p-2 text-center">Avg</th>
              <th className="p-2 text-center">Idf</th>
              <th className="min-w-[200px] p-2 text-left">Competency remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const nums = activities.map((a) => validActivityScore(vals[`s:${a.id}_${r.id}`] ?? "")).map((x) => (typeof x === "number" ? x : null));
              const avg = activityAverage(nums);
              const band = bandFor(avg, bands);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="hidden p-2 text-slate-400 sm:table-cell">{ri + 1}</td>
                  <td className="sticky left-0 z-10 max-w-[9.5rem] bg-white p-2 leading-tight shadow-[1px_0_0_#e2e8f0] sm:max-w-none">{r.name}<span className="block font-mono text-[11px] text-slate-500">{r.admissionNo}</span></td>
                  {activities.map((a, ai) => {
                    const k = `s:${a.id}_${r.id}`;
                    const v = vals[k] ?? "";
                    const bad = validActivityScore(v) === "invalid";
                    const changed = norm(server[k] ?? "") !== norm(v);
                    return (
                      <td key={a.id} className="p-1 text-center">
                        <input
                          ref={(el) => { refs.current[`${ai}:${ri}`] = el; }}
                          name={`s_${a.id}_${r.id}`}
                          value={v}
                          disabled={readOnly}
                          inputMode="decimal"
                          enterKeyHint={ri < rows.length - 1 ? "next" : "done"}
                          autoComplete="off"
                          aria-label={`${a.title} score for ${r.name}`}
                          aria-invalid={bad}
                          onChange={(e) => set(k, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); refs.current[`${ai}:${ri + 1}`]?.focus(); }
                            if (e.key === "ArrowUp") { e.preventDefault(); refs.current[`${ai}:${ri - 1}`]?.focus(); }
                          }}
                          className={`h-11 w-16 rounded border px-2 text-center text-base sm:h-8 sm:text-sm ${bad ? "border-red-500 bg-red-50" : changed ? "border-amber-400 bg-amber-50/60" : "border-slate-300"} disabled:bg-slate-100`}
                        />
                      </td>
                    );
                  })}
                  <td className="p-2 text-center font-medium">{avg ?? "—"}</td>
                  <td className="p-2 text-center" title={band?.remark}>{band ? <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-800">{band.grade}</span> : "—"}</td>
                  <td className="p-1">
                    <input name={`r_${r.id}`} value={vals[`r:${r.id}`] ?? ""} onChange={(e) => set(`r:${r.id}`, e.target.value)} disabled={readOnly} maxLength={200}
                      placeholder="e.g. can present and critique the text" className="h-11 w-full rounded border border-slate-300 px-2 text-base sm:h-8 sm:text-xs disabled:bg-slate-100" aria-label={`Remark for ${r.name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && <SaveBar unsaved={unsaved} disabled={invalid > 0} label="Save scores & remarks" />}
    </ActionForm>
  );
}
