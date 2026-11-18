"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import type { ActionResult } from "@/server/action";

const OPTS = [
  { v: "PRESENT", l: "P", c: "peer-checked:bg-emerald-600" },
  { v: "ABSENT", l: "A", c: "peer-checked:bg-red-600" },
  { v: "LATE", l: "L", c: "peer-checked:bg-amber-500" },
  { v: "EXCUSED", l: "E", c: "peer-checked:bg-brand-600" },
];

export function AttendanceGrid({
  action, rows, hidden, withTime,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  rows: { id: string; label: string; sub?: string; status: string | null; remark: string | null; timeIn?: string | null }[];
  hidden: Record<string, string>; withTime?: boolean;
}) {
  const [vals, setVals] = React.useState(() => Object.fromEntries(rows.map((r) => [r.id, r.status ?? "PRESENT"])));
  const counts = OPTS.map((o) => `${Object.values(vals).filter((v) => v === o.v).length} ${o.v.toLowerCase()}`).join(" · ");
  return (
    <ActionForm action={action} hideSubmit>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">{counts}</span>
        <button type="button" onClick={() => setVals(Object.fromEntries(rows.map((r) => [r.id, "PRESENT"])))} className="ml-auto rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">Mark all present</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 first:border-0">
                <td className="w-8 p-2 text-slate-400">{i + 1}</td>
                <td className="p-2">{r.label}{r.sub && <span className="block text-xs text-slate-500">{r.sub}</span>}</td>
                <td className="p-2">
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${r.label}`}>
                    {OPTS.map((o) => (
                      <label key={o.v} title={o.v}>
                        <input type="radio" name={`s_${r.id}`} value={o.v} checked={vals[r.id] === o.v} onChange={() => setVals({ ...vals, [r.id]: o.v })} className="peer sr-only" />
                        <span className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-slate-300 text-xs font-semibold text-slate-600 peer-checked:border-transparent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 ${o.c}`}>{o.l}</span>
                      </label>
                    ))}
                  </div>
                </td>
                {withTime && <td className="p-2"><input type="time" name={`in_${r.id}`} defaultValue={r.timeIn ?? ""} className="h-8 rounded border border-slate-300 px-1 text-xs" aria-label="Time in" /></td>}
                <td className="p-2"><input name={`r_${r.id}`} defaultValue={r.remark ?? ""} placeholder="Remark" className="h-8 w-full min-w-[120px] rounded border border-slate-300 px-2 text-xs" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><SubmitButton>Save attendance</SubmitButton></div>
    </ActionForm>
  );
}
