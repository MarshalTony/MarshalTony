import type { Progress } from "@/lib/exams/progress";
import { pctOf } from "@/lib/exams/progress";

const BAR: Record<Progress, string> = { complete: "bg-emerald-500", partial: "bg-amber-500", none: "bg-red-500", na: "bg-slate-200" };
const TONE: Record<Progress, string> = { complete: "text-emerald-700", partial: "text-amber-700", none: "text-red-700", na: "text-slate-400" };

/** A small progress bar with "done / expected" (green complete, amber partial, red nothing yet). */
export function ProgressMeter({ done, expected, state, label }: { done: number; expected: number; state: Progress; label?: string }) {
  if (state === "na") return <span className="text-xs text-slate-400">{label ?? "—"}</span>;
  return (
    <div className="min-w-[7rem]">
      <div className="h-1.5 w-full rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${BAR[state]}`} style={{ width: `${Math.max(state === "none" ? 0 : 4, pctOf(done, expected))}%` }} /></div>
      <p className={`mt-0.5 text-xs ${TONE[state]}`}>{label ?? `${done} / ${expected}`}</p>
    </div>
  );
}
