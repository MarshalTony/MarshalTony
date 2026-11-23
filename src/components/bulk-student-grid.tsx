"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import { Button } from "./ui/button";
import type { ActionResult } from "@/server/action";

export type BulkRow = {
  id: string; admissionNo: string; lastName: string; firstName: string; otherNames: string;
  gender: "MALE" | "FEMALE"; streamId: string; residence: "DAY" | "BOARDING";
  linNumber: string; schoolPayCode: string; combinationId: string; houseId: string; electives: string[];
};
type Opt = { value: string; label: string };

const same = (a: BulkRow, b: BulkRow) =>
  a.lastName === b.lastName && a.firstName === b.firstName && a.otherNames === b.otherNames && a.gender === b.gender &&
  a.streamId === b.streamId && a.residence === b.residence && a.linNumber === b.linNumber && a.schoolPayCode === b.schoolPayCode &&
  a.combinationId === b.combinationId && a.houseId === b.houseId && [...a.electives].sort().join() === [...b.electives].sort().join();

const cellInput = "h-7 rounded border border-slate-300 px-1.5 text-xs focus:border-brand-500 focus:outline-none";
const cellSelect = "h-7 rounded border border-slate-300 bg-white px-1 text-xs";

export function BulkStudentGrid({
  action, classId, rows: initial, streams, electives, combinations, houses = [],
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  classId: string; rows: BulkRow[]; streams: (Opt & { category?: string | null })[];
  electives: { id: string; label: string; title: string }[];
  /** A-Level only: combination → its subject ids (ticks follow the combination when it is changed). */
  combinations: { value: string; label: string; subjectIds: string[]; category?: string | null }[] | null;
  houses?: Opt[];
}) {
  const [rows, setRows] = React.useState(initial);
  const [base, setBase] = React.useState(initial);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulk, setBulk] = React.useState({ streamId: "", residence: "", gender: "", houseId: "" });
  React.useEffect(() => { setRows(initial); setBase(initial); setSelected(new Set()); }, [initial]);

  const baseBy = React.useMemo(() => new Map(base.map((r) => [r.id, r])), [base]);
  const dirty = rows.filter((r) => !same(r, baseBy.get(r.id)!));
  const invalid = rows.filter((r) => !r.lastName.trim() || !r.firstName.trim());
  const set = (id: string, patch: Partial<BulkRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const toggleElective = (id: string, sub: string, on: boolean) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, electives: on ? [...new Set([...r.electives, sub])] : r.electives.filter((x) => x !== sub) } : r)));
  const targets = selected.size ? rows.filter((r) => selected.has(r.id)) : [];
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function applyBulk() {
    const ids = new Set(targets.map((r) => r.id));
    setRows((rs) => rs.map((r) => (!ids.has(r.id) ? r : {
      ...r,
      ...(bulk.streamId ? { streamId: bulk.streamId } : {}),
      ...(bulk.residence ? { residence: bulk.residence as BulkRow["residence"] } : {}),
      ...(bulk.gender ? { gender: bulk.gender as BulkRow["gender"] } : {}),
      ...(bulk.houseId ? { houseId: bulk.houseId === "none" ? "" : bulk.houseId } : {}),
    })));
  }
  /** Column header tick: everyone (or the ticked learners) take / drop the subject. */
  function columnAll(sub: string) {
    const scope = selected.size ? targets : rows;
    const allHave = scope.every((r) => r.electives.includes(sub));
    const ids = new Set(scope.map((r) => r.id));
    setRows((rs) => rs.map((r) => (!ids.has(r.id) ? r : { ...r, electives: allHave ? r.electives.filter((x) => x !== sub) : [...new Set([...r.electives, sub])] })));
  }

  return (
    <ActionForm action={action} hideSubmit onSuccess={() => setBase(rows)}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="rows" value={JSON.stringify(dirty)} />

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
        <span className="self-center font-medium text-slate-700">{selected.size ? `${selected.size} ticked:` : "Tick learners to change several at once:"}</span>
        <select aria-label="Set stream" className={cellSelect} value={bulk.streamId} onChange={(e) => setBulk({ ...bulk, streamId: e.target.value })}>
          <option value="">Stream…</option>{streams.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Set day or boarding" className={cellSelect} value={bulk.residence} onChange={(e) => setBulk({ ...bulk, residence: e.target.value })}>
          <option value="">Day / boarding…</option><option value="DAY">Day</option><option value="BOARDING">Boarding</option>
        </select>
        <select aria-label="Set gender" className={cellSelect} value={bulk.gender} onChange={(e) => setBulk({ ...bulk, gender: e.target.value })}>
          <option value="">Gender…</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
        </select>
        {houses.length > 0 && (
          <select aria-label="Set house" className={cellSelect} value={bulk.houseId} onChange={(e) => setBulk({ ...bulk, houseId: e.target.value })}>
            <option value="">House…</option>{houses.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}<option value="none">No house</option>
          </select>
        )}
        <Button type="button" size="sm" variant="secondary" disabled={!selected.size || (!bulk.streamId && !bulk.residence && !bulk.gender && !bulk.houseId)} onClick={applyBulk}>Apply to ticked</Button>
        {electives.length > 0 && <span className="self-center text-xs text-slate-500">Click a subject heading to tick it for {selected.size ? "the ticked learners" : "everyone"} (click again to untick).</span>}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>{rows.length} students</span>
        <span className={dirty.length ? "font-medium text-amber-700" : ""}>{dirty.length} changed</span>
        {invalid.length > 0 && <span className="font-medium text-red-700">{invalid.length} missing a name</span>}
        <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!dirty.length} onClick={() => setRows(base)}>Undo changes</Button>
          <SubmitButton size="sm" disabled={!dirty.length || invalid.length > 0}>Save {dirty.length || ""} change{dirty.length === 1 ? "" : "s"}</SubmitButton>
        </span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="p-1.5"><input type="checkbox" aria-label="Tick all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th className="p-1.5 text-left">Adm. No.</th>
              <th className="p-1.5 text-left">Last name</th>
              <th className="p-1.5 text-left">First name</th>
              <th className="p-1.5 text-left">Other</th>
              <th className="p-1.5 text-left">Sex</th>
              <th className="p-1.5 text-left">Stream</th>
              <th className="p-1.5 text-left">Day/Brd</th>
              <th className="p-1.5 text-left">LIN</th>
              <th className="p-1.5 text-left">SchoolPay</th>
              {houses.length > 0 && <th className="p-1.5 text-left">House</th>}
              {combinations && <th className="p-1.5 text-left">Combination</th>}
              {electives.map((e) => (
                <th key={e.id} className="p-1 text-center normal-case" title={`${e.title} — click to tick/untick the column`}>
                  <button type="button" className="rounded px-1 font-semibold text-brand-700 hover:bg-brand-50" onClick={() => columnAll(e.id)}>{e.label}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = !same(r, baseBy.get(r.id)!);
              return (
                <tr key={r.id} className={`border-t border-slate-100 ${changed ? "bg-amber-50" : ""}`}>
                  <td className="p-1.5 text-center"><input type="checkbox" aria-label={`Tick ${r.lastName} ${r.firstName}`} checked={selected.has(r.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSelected(s); }} /></td>
                  <td className="whitespace-nowrap p-1.5 font-mono">{r.admissionNo}</td>
                  <td className="p-1"><input aria-label="Last name" className={`${cellInput} w-28 ${!r.lastName.trim() ? "border-red-500" : ""}`} value={r.lastName} onChange={(e) => set(r.id, { lastName: e.target.value })} /></td>
                  <td className="p-1"><input aria-label="First name" className={`${cellInput} w-28 ${!r.firstName.trim() ? "border-red-500" : ""}`} value={r.firstName} onChange={(e) => set(r.id, { firstName: e.target.value })} /></td>
                  <td className="p-1"><input aria-label="Other names" className={`${cellInput} w-24`} value={r.otherNames} onChange={(e) => set(r.id, { otherNames: e.target.value })} /></td>
                  <td className="p-1">
                    <select aria-label="Sex" className={cellSelect} value={r.gender} onChange={(e) => set(r.id, { gender: e.target.value as BulkRow["gender"] })}><option value="MALE">M</option><option value="FEMALE">F</option></select>
                  </td>
                  <td className="p-1">
                    <select aria-label="Stream" className={cellSelect} value={r.streamId} onChange={(e) => set(r.id, { streamId: e.target.value })}>{streams.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                  </td>
                  <td className="p-1">
                    <select aria-label="Day or boarding" className={cellSelect} value={r.residence} onChange={(e) => set(r.id, { residence: e.target.value as BulkRow["residence"] })}><option value="DAY">Day</option><option value="BOARDING">Boarding</option></select>
                  </td>
                  <td className="p-1"><input aria-label="LIN" className={`${cellInput} w-36`} value={r.linNumber} onChange={(e) => set(r.id, { linNumber: e.target.value })} /></td>
                  <td className="p-1"><input aria-label="SchoolPay code" className={`${cellInput} w-24`} value={r.schoolPayCode} onChange={(e) => set(r.id, { schoolPayCode: e.target.value })} /></td>
                  {houses.length > 0 && (
                    <td className="p-1">
                      <select aria-label="House" className={cellSelect} value={r.houseId} onChange={(e) => set(r.id, { houseId: e.target.value })}>
                        <option value="">—</option>{houses.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                      </select>
                    </td>
                  )}
                  {combinations && (
                    <td className="p-1">
                      <select aria-label="Combination" className={cellSelect} value={r.combinationId} onChange={(e) => {
                        const c = combinations.find((x) => x.value === e.target.value);
                        const electiveIds = new Set(electives.map((x) => x.id));
                        // The stream follows the combination's category (Arts / Sciences) when a stream holds it.
                        const fit = c?.category ? streams.filter((s) => s.category === c.category) : [];
                        const stream = fit.some((s) => s.value === r.streamId) ? r.streamId : fit[0]?.value ?? r.streamId;
                        set(r.id, { combinationId: e.target.value, streamId: stream, ...(c ? { electives: c.subjectIds.filter((id) => electiveIds.has(id)) } : {}) });
                      }}>
                        <option value="">—</option>{combinations.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </td>
                  )}
                  {electives.map((e) => (
                    <td key={e.id} className="p-1 text-center">
                      <input type="checkbox" aria-label={`${r.lastName} ${r.firstName} takes ${e.title}`} checked={r.electives.includes(e.id)} onChange={(ev) => toggleElective(r.id, e.id, ev.target.checked)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
