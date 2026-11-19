"use client";
import * as React from "react";
import { RefreshCw, Wand2 } from "lucide-react";
import { ActionForm, SubmitButton } from "./forms";
import { Button } from "./ui/button";
import { matching, pickComment, type BankEntry } from "@/lib/comment-bank";
import type { ActionResult } from "@/server/action";

type Field = "conduct" | "classTeacherComment" | "dosComment" | "headteacherComment";
type Row = { studentId: string; name: string; firstName: string; pos: string; score: number | null; grade: string | null } & Record<Field, string>;
const ROLE: Record<Exclude<Field, "conduct">, string> = { classTeacherComment: "CLASS_TEACHER", dosComment: "DOS", headteacherComment: "HEADTEACHER" };
const CONDUCT = ["Excellent", "Very good", "Good", "Fair", "Poor"];

export function CommentsGrid({
  action, examId, streamId, rows: initial, bank, can, showDos, basisLabel,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  examId: string; streamId: string; rows: Row[]; bank: BankEntry[];
  can: Record<Field, boolean>; showDos: boolean; basisLabel: string;
}) {
  const [rows, setRows] = React.useState(initial);
  const [base, setBase] = React.useState(initial);
  const [variant, setVariant] = React.useState<Record<string, number>>({});
  React.useEffect(() => { setRows(initial); setBase(initial); }, [initial]);
  const baseBy = React.useMemo(() => new Map(base.map((r) => [r.studentId, r])), [base]);
  const fields: Field[] = ["conduct", "classTeacherComment", ...(showDos ? (["dosComment"] as Field[]) : []), "headteacherComment"];
  const changed = (r: Row) => fields.some((f) => r[f] !== baseBy.get(r.studentId)![f]);
  const dirty = rows.filter(changed);
  const set = (id: string, f: Field, v: string) => setRows((rs) => rs.map((r) => (r.studentId === id ? { ...r, [f]: v } : r)));

  /** Fill every empty comment in a column from the bank, varying the wording down the list. */
  function fillEmpty(f: Exclude<Field, "conduct">) {
    setRows((rs) => rs.map((r, i) => (r[f].trim() ? r : { ...r, [f]: pickComment(bank, ROLE[f], r.score, r.firstName, i) })));
  }
  function another(r: Row, f: Exclude<Field, "conduct">) {
    const k = `${r.studentId}:${f}`;
    const n = (variant[k] ?? 0) + 1;
    setVariant({ ...variant, [k]: n });
    set(r.studentId, f, pickComment(bank, ROLE[f], r.score, r.firstName, n));
  }
  const emptyIn = (f: Field) => rows.filter((r) => !r[f].trim()).length;
  const label: Record<Field, string> = { conduct: "Conduct", classTeacherComment: "Class teacher's comment", dosComment: "DOS comment", headteacherComment: "Head teacher's comment" };

  return (
    <ActionForm action={action} hideSubmit onSuccess={() => setBase(rows)}>
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="streamId" value={streamId} />
      {dirty.map((r) => fields.filter((f) => can[f]).map((f) => <input key={`${r.studentId}-${f}`} type="hidden" name={`${f}_${r.studentId}`} value={r[f]} />))}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
        <Wand2 className="h-4 w-4 text-brand-700" />
        <span className="font-medium text-slate-700">Fill empty comments from the comment bank:</span>
        {(Object.keys(ROLE) as Exclude<Field, "conduct">[]).filter((f) => can[f] && (f !== "dosComment" || showDos)).map((f) => (
          <Button key={f} type="button" size="sm" variant="secondary" disabled={!emptyIn(f)} onClick={() => fillEmpty(f)}>{label[f]} ({emptyIn(f)} empty)</Button>
        ))}
        <span className="text-xs text-slate-500">Existing comments are never replaced. Review, edit, then Save.</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>{rows.length} students · score = {basisLabel}</span>
        <span className={dirty.length ? "font-medium text-amber-700" : ""}>{dirty.length} changed</span>
        <span className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!dirty.length} onClick={() => setRows(base)}>Undo changes</Button>
          <SubmitButton size="sm" disabled={!dirty.length}>Save {dirty.length || ""} student{dirty.length === 1 ? "" : "s"}</SubmitButton>
        </span>
      </div>

      <div className="max-h-[72vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-2 text-left">Pos.</th><th className="p-2 text-left">Student</th><th className="p-2 text-left">Score</th>
              {fields.map((f) => <th key={f} className="p-2 text-left">{label[f]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className={`border-t border-slate-100 align-top ${changed(r) ? "bg-amber-50" : ""}`}>
                <td className="p-2 text-slate-500">{r.pos}</td>
                <td className="whitespace-nowrap p-2 font-medium">{r.name}</td>
                <td className="whitespace-nowrap p-2">{r.score === null ? "—" : `${r.score.toFixed(1)}%`}{r.grade ? <span className="ml-1 rounded bg-slate-100 px-1 text-xs font-semibold">{r.grade}</span> : null}</td>
                {fields.map((f) => f === "conduct" ? (
                  <td key={f} className="p-1">
                    <input list="conduct-options" aria-label={`Conduct of ${r.name}`} value={r.conduct} disabled={!can.conduct} onChange={(e) => set(r.studentId, "conduct", e.target.value)} className="h-8 w-28 rounded border border-slate-300 px-1.5 text-xs disabled:bg-slate-50" placeholder="Good" />
                  </td>
                ) : (
                  <td key={f} className="p-1">
                    <div className="flex items-start gap-1">
                      <textarea aria-label={`${label[f]} for ${r.name}`} value={r[f]} disabled={!can[f]} rows={2} maxLength={500} onChange={(e) => set(r.studentId, f, e.target.value)} className="w-full min-w-[200px] rounded border border-slate-300 p-1.5 text-xs disabled:bg-slate-50" />
                      {can[f] && matching(bank, ROLE[f], r.score).length > 0 && (
                        <button type="button" onClick={() => another(r, f)} title="Use a comment from the bank (click again for another)" aria-label={`Suggest ${label[f]} for ${r.name}`} className="mt-1 rounded p-1 text-slate-400 hover:bg-brand-50 hover:text-brand-700"><RefreshCw className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <datalist id="conduct-options">{CONDUCT.map((c) => <option key={c} value={c} />)}</datalist>
    </ActionForm>
  );
}
