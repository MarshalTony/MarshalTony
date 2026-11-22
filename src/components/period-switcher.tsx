"use client";
import * as React from "react";
import { ActionForm } from "./forms";
import { Label, Select } from "./ui/input";
import type { ActionResult } from "@/server/action";

type Year = { id: string; name: string; warnings: string[]; terms: { id: string; name: string; dates: string; isCurrent: boolean }[] };

/** Choose the year, then one of its terms, and make it the school's current year and term. */
export function PeriodSwitcher({ years, action, currentTermId }: { years: Year[]; action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; currentTermId: string | null }) {
  const current = years.find((y) => y.terms.some((t) => t.id === currentTermId));
  const [yearId, setYearId] = React.useState(current?.id ?? years[0]?.id ?? "");
  const year = years.find((y) => y.id === yearId);
  const [termId, setTermId] = React.useState(currentTermId ?? year?.terms[0]?.id ?? "");
  const term = year?.terms.find((t) => t.id === termId);
  const changingYear = !!current && year?.id !== current.id;
  const confirm = term
    ? `Switch the whole school to ${year!.name}, ${term.name}?\n\nNew marks, attendance, activity scores, fees and reports will use this term${changingYear ? ` and the ${year!.name} classes, subjects and teacher allocations` : ""}.${year!.warnings.length ? `\n\nNote: ${year!.warnings.join("; ")}.` : ""}`
    : undefined;
  return (
    <ActionForm action={action} submitLabel={termId === currentTermId ? "Already current" : "Switch"} confirmText={confirm} className="space-y-3">
      <input type="hidden" name="id" value={termId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="switch-year">Academic year</Label>
          <Select id="switch-year" value={yearId} onChange={(e) => { const y = years.find((x) => x.id === e.target.value); setYearId(e.target.value); setTermId(y?.terms.find((t) => t.isCurrent)?.id ?? y?.terms[0]?.id ?? ""); }} className="w-full">
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.id === current?.id ? " (current)" : ""}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="switch-term">Term</Label>
          <Select id="switch-term" value={termId} onChange={(e) => setTermId(e.target.value)} disabled={!year?.terms.length} className="w-full">
            {!year?.terms.length && <option value="">No terms in {year?.name} yet</option>}
            {year?.terms.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.dates}){t.isCurrent ? " — current" : ""}</option>)}
          </Select>
        </div>
      </div>
      {year && year.warnings.length > 0 && changingYear && (
        <ul className="list-disc rounded-md border border-amber-200 bg-amber-50 py-2 pl-6 pr-3 text-xs text-amber-900">
          {year.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </ActionForm>
  );
}
