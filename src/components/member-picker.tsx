"use client";
import * as React from "react";
import { ActionForm } from "./forms";
import { Input } from "./ui/input";
import type { ActionResult } from "@/server/action";

type Row = { id: string; admissionNo: string; name: string; detail?: string; extra?: React.ReactNode };

/**
 * A list of students with tick boxes (with "tick all" and a quick filter) that posts the ticked ids as
 * `studentIds[]` to a server action — used to add or remove house and club members.
 */
export function MemberPicker({
  rows, action, hidden, submitLabel, submitVariant = "default", confirm, empty, extraHeader,
}: {
  rows: Row[]; action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; hidden: Record<string, string>;
  submitLabel: string; submitVariant?: "default" | "outline" | "destructive" | "secondary"; confirm?: string; empty: string; extraHeader?: string;
}) {
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => words.every((w) => `${r.name} ${r.admissionNo} ${r.detail ?? ""}`.toLowerCase().includes(w)));
  const allShown = shown.length > 0 && shown.every((r) => ticked.has(r.id));
  const toggle = (id: string) => setTicked((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setTicked((t) => { const n = new Set(t); for (const r of shown) if (allShown) n.delete(r.id); else n.add(r.id); return n; });
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ActionForm action={action} submitLabel={`${submitLabel}${ticked.size ? ` (${ticked.size})` : ""}`} submitVariant={submitVariant} confirmText={confirm} onSuccess={() => setTicked(new Set())}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {[...ticked].map((id) => <input key={id} type="hidden" name="studentIds[]" value={id} />)}
      {rows.length > 8 && <Input aria-label="Filter the list" placeholder="Filter by name, admission no. or class" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />}
      <div className="max-h-[28rem] overflow-y-auto rounded border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-8 p-2"><input type="checkbox" aria-label="Tick all" checked={allShown} onChange={toggleAll} /></th>
              <th className="p-2">Student</th><th className="p-2">Adm. no.</th><th className="p-2">Class</th>{extraHeader && <th className="p-2">{extraHeader}</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 ${ticked.has(r.id) ? "bg-brand-50" : ""}`}>
                <td className="p-2"><input type="checkbox" aria-label={`Tick ${r.name}`} checked={ticked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2 font-medium">{r.name}</td>
                <td className="p-2 font-mono text-xs">{r.admissionNo}</td>
                <td className="p-2 text-xs">{r.detail}</td>
                {extraHeader && <td className="p-2 text-xs">{r.extra}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{ticked.size} ticked · {shown.length} shown of {rows.length}</p>
    </ActionForm>
  );
}
