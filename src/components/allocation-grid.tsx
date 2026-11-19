"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "./forms";
import { Button } from "./ui/button";
import type { ActionResult } from "@/server/action";

type Opt = { value: string; label: string };
/** cell value: a staff id, "" (nobody), or "*" (several teachers — left as they are unless changed). */
type Cells = Record<string, string>;
const key = (subjectId: string, streamId: string) => `${subjectId}:${streamId}`;
const MULTI = "*";

export function AllocationGrid({
  action, classId, academicYearId, subjects, streams, teachers, initial, initialClassTeachers, multiNames, readOnly = false,
}: {
  readOnly?: boolean;
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  classId: string; academicYearId: string;
  subjects: { id: string; name: string; group: string }[];
  streams: { id: string; name: string }[];
  /** Label includes the teacher's current number of allocations this year. */
  teachers: Opt[];
  initial: Cells; initialClassTeachers: Record<string, string>; multiNames: Record<string, string>;
}) {
  const [cells, setCells] = React.useState(initial);
  const [base, setBase] = React.useState(initial);
  const [cts, setCts] = React.useState(initialClassTeachers);
  const [baseCts, setBaseCts] = React.useState(initialClassTeachers);
  React.useEffect(() => { setCells(initial); setBase(initial); }, [initial]);
  React.useEffect(() => { setCts(initialClassTeachers); setBaseCts(initialClassTeachers); }, [initialClassTeachers]);

  const changedCells = Object.keys(cells).filter((k) => cells[k] !== base[k] && cells[k] !== MULTI);
  const changedCts = streams.filter((s) => (cts[s.id] ?? "") !== (baseCts[s.id] ?? ""));
  const dirty = changedCells.length + changedCts.length;
  const payload = JSON.stringify({
    cells: changedCells.map((k) => { const [subjectId, streamId] = k.split(":"); return { subjectId, streamId, staffId: cells[k] }; }),
    classTeachers: changedCts.map((s) => ({ streamId: s.id, staffId: cts[s.id] ?? "" })),
  });
  const filled = Object.values(cells).filter((v) => v).length;
  const total = subjects.length * streams.length;

  const select = (value: string, onChange: (v: string) => void, label: string, changed: boolean, multi?: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      className={`h-8 w-full min-w-[9rem] rounded border px-1 text-xs ${changed ? "border-amber-400 bg-amber-50" : value ? "border-slate-300 bg-white" : "border-dashed border-slate-300 bg-slate-50 text-slate-400"}`}
      title={multi}
    >
      <option value="">— none —</option>
      {value === MULTI && <option value={MULTI}>{multi ?? "Several teachers"}</option>}
      {teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
    </select>
  );

  let lastGroup = "";
  return (
    <ActionForm action={action} hideSubmit onSuccess={() => { setBase(cells); setBaseCts(cts); }}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="payload" value={payload} />
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span><b>{filled}</b> of {total} subject places have a teacher</span>
        <span className={dirty ? "font-medium text-amber-700" : ""}>{dirty} change{dirty === 1 ? "" : "s"}</span>
        {!readOnly && <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!dirty} onClick={() => { setCells(base); setCts(baseCts); }}>Undo changes</Button>
          <SubmitButton size="sm" disabled={!dirty}>Save {dirty || ""} change{dirty === 1 ? "" : "s"}</SubmitButton>
        </span>}
      </div>
      <div className="max-h-[72vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 p-2 text-left">Subject</th>
              {streams.map((s) => <th key={s.id} className="p-2 text-left">Stream {s.name}</th>)}
              {streams.length > 1 && !readOnly && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b-2 border-slate-200 bg-emerald-50/60">
              <td className="sticky left-0 bg-emerald-50 p-2 font-semibold text-emerald-900">Class teacher</td>
              {streams.map((s) => (
                <td key={s.id} className="p-1">{select(cts[s.id] ?? "", (v) => setCts({ ...cts, [s.id]: v }), `Class teacher of stream ${s.name}`, (cts[s.id] ?? "") !== (baseCts[s.id] ?? ""))}</td>
              ))}
              {streams.length > 1 && !readOnly && <td />}
            </tr>
            {subjects.map((sub) => {
              const header = sub.group !== lastGroup ? sub.group : null;
              lastGroup = sub.group;
              const first = cells[key(sub.id, streams[0]?.id ?? "")] ?? "";
              return (
                <React.Fragment key={sub.id}>
                  {header && <tr><td colSpan={streams.length + (readOnly ? 1 : 2)} className="bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{header}</td></tr>}
                  <tr className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white p-2 font-medium">{sub.name}</td>
                    {streams.map((st) => {
                      const k = key(sub.id, st.id);
                      return <td key={st.id} className="p-1">{select(cells[k] ?? "", (v) => setCells({ ...cells, [k]: v }), `${sub.name}, stream ${st.name}`, (cells[k] ?? "") !== (base[k] ?? ""), multiNames[k])}</td>;
                    })}
                    {streams.length > 1 && !readOnly && (
                      <td className="p-1">
                        <Button
                          type="button" size="sm" variant="ghost"
                          disabled={!first || first === MULTI}
                          title="Give every stream the same teacher as the first stream"
                          onClick={() => setCells({ ...cells, ...Object.fromEntries(streams.map((st) => [key(sub.id, st.id), first])) })}
                        >→ all streams</Button>
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
