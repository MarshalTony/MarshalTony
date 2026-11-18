"use client";
import * as React from "react";
import { ActionForm } from "./forms";
import type { ActionResult } from "@/server/action";

type Row = { id: string; name: string; admissionNo: string; stream: string; average: number | null };
const OPTIONS = ["PROMOTE", "REPEAT", "GRADUATE", "SKIP"] as const;

export function PromotionTable({
  action, rows, defaultDecision, fromClassId, toYearId, streams,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  rows: Row[]; defaultDecision: (typeof OPTIONS)[number]; fromClassId: string; toYearId: string; streams: { id: string; name: string }[];
}) {
  const [decisions, setDecisions] = React.useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, defaultDecision])));
  const setAll = (d: string) => setDecisions(Object.fromEntries(rows.map((r) => [r.id, d])));
  const counts = OPTIONS.map((o) => `${Object.values(decisions).filter((d) => d === o).length} ${o.toLowerCase()}`).join(" · ");
  return (
    <ActionForm action={action} submitLabel="Apply promotion" confirmText={`Apply these decisions? ${counts}`}>
      <input type="hidden" name="fromClassId" value={fromClassId} />
      <input type="hidden" name="toYearId" value={toYearId} />
      <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Set all:</span>
        {OPTIONS.map((o) => <button type="button" key={o} onClick={() => setAll(o)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50">{o}</button>)}
        {streams.length > 0 && (
          <label className="ml-auto flex items-center gap-2">
            Fallback stream in next class:
            <select name="fallbackStreamId" className="h-8 rounded border border-slate-300 px-2">
              <option value="">Same name only</option>
              {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500">{counts}</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2 text-left">Student</th><th className="p-2 text-left">Stream</th><th className="p-2 text-left">Last average</th><th className="p-2 text-left">Decision</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-2">{r.name}<span className="block font-mono text-xs text-slate-500">{r.admissionNo}</span></td>
                <td className="p-2">{r.stream}</td>
                <td className="p-2">{r.average === null ? "—" : `${r.average.toFixed(1)}%`}</td>
                <td className="p-2">
                  <select value={decisions[r.id]} onChange={(e) => setDecisions({ ...decisions, [r.id]: e.target.value })} className="h-8 rounded border border-slate-300 px-2" aria-label={`Decision for ${r.name}`}>
                    {OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
