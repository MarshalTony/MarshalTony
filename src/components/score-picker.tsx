"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label, Select } from "./ui/input";

type Opt = { value: string; label: string };
export type PickerField = { name: string; label: string; value?: string; options: Opt[]; placeholder: string; resets?: string[] };

/** Labelled selects (e.g. Class → Subject → Term) that update the URL. Changing a field clears the fields that depend on it. */
export function ScorePicker({ fields }: { fields: PickerField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function change(f: PickerField, v: string) {
    const q = new URLSearchParams(params.toString());
    if (v) q.set(f.name, v); else q.delete(f.name);
    for (const r of f.resets ?? []) q.delete(r);
    q.delete("correct");
    router.push(`${pathname}?${q.toString()}`);
  }
  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
      {fields.map((f, i) => (
        <div key={f.name} className="space-y-1">
          <Label htmlFor={`pick-${f.name}`}>{i + 1}. {f.label}</Label>
          <Select id={`pick-${f.name}`} value={f.value ?? ""} onChange={(e) => change(f, e.target.value)} disabled={f.options.length === 0} className="w-full">
            <option value="">{f.options.length ? f.placeholder : "None available"}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      ))}
    </div>
  );
}
