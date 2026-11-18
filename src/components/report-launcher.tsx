"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { Input, Select } from "./ui/input";

export function ReportLauncher({ title, description, base, fixed = {}, fields = [] }: {
  title: string; description: string; base: string; fixed?: Record<string, string>;
  fields?: { name: string; label: string; type: "select" | "date"; options?: { value: string; label: string }[]; value?: string; required?: boolean }[];
}) {
  const ref = React.useRef<HTMLFormElement>(null);
  function open(format: string) {
    const fd = new FormData(ref.current!);
    const q = new URLSearchParams(fixed);
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v) q.set(k, v);
    for (const f of fields) if (f.required && !q.get(f.name)) { alert(`Choose ${f.label.toLowerCase()} first.`); return; }
    q.set("format", format);
    window.open(`${base}?${q.toString()}`, "_blank", "noopener");
  }
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()} className="rounded-md border border-slate-200 p-3">
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mb-2 text-xs text-slate-500">{description}</p>
      {fields.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {fields.map((f) => f.type === "date"
            ? <Input key={f.name} type="date" name={f.name} defaultValue={f.value} className="h-8 w-auto text-xs" aria-label={f.label} />
            : <Select key={f.name} name={f.name} defaultValue={f.value ?? ""} className="h-8 w-auto text-xs" aria-label={f.label}>
                {!f.required && <option value="">{f.label}: all</option>}
                {f.required && !f.value && <option value="">{f.label}…</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>)}
        </div>
      )}
      <div className="flex gap-1">
        {["pdf", "xlsx", "csv"].map((f) => (
          <button key={f} type="button" onClick={() => open(f)} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50"><Download className="h-3 w-3" />{f.toUpperCase()}</button>
        ))}
      </div>
    </form>
  );
}
