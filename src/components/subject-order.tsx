"use client";
import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ActionForm, SubmitButton } from "./forms";
import { Button } from "./ui/button";
import type { ActionResult } from "@/server/action";

type Sub = { id: string; name: string; code: string; category: string };

/** Drag-free ordering for report cards: ▲ / ▼ moves a subject; Save stores positions 1, 2, 3 … */
export function SubjectOrder({ action, level, subjects, readOnly }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; level: string; subjects: Sub[]; readOnly: boolean }) {
  const [list, setList] = React.useState(subjects);
  const [base, setBase] = React.useState(subjects);
  React.useEffect(() => { setList(subjects); setBase(subjects); }, [subjects]);
  const dirty = list.some((s, i) => s.id !== base[i]?.id);
  const move = (i: number, d: -1 | 1) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <ActionForm action={action} hideSubmit onSuccess={() => setBase(list)}>
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="ids" value={JSON.stringify(list.map((s) => s.id))} />
      <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {list.map((s, i) => (
          <li key={s.id} className={`flex items-center gap-3 px-3 py-1.5 text-sm ${s.id !== base[i]?.id ? "bg-amber-50" : ""}`}>
            <span className="w-6 text-right font-mono text-xs text-slate-400">{i + 1}</span>
            <span className="flex-1 font-medium">{s.name} <span className="text-xs font-normal text-slate-500">{s.code} · {s.category.toLowerCase()}</span></span>
            {!readOnly && (
              <span className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${s.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!dirty} onClick={() => setList(base)}>Undo</Button>
          <SubmitButton size="sm" disabled={!dirty}>Save order</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
