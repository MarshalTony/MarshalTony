"use client";
import { CheckCircle2, CloudOff } from "lucide-react";
import { usePending, SubmitButton } from "./forms";

/**
 * Marks-entry save bar, pinned to the bottom of the screen: says whether everything is saved, how many changes are
 * waiting (kept on this device meanwhile), and holds the Save button so it is always in reach on a phone.
 */
export function SaveBar({ unsaved, label, disabled, variant, extra }: { unsaved: number; label: string; disabled?: boolean; variant?: "default" | "destructive"; extra?: React.ReactNode }) {
  const pending = usePending();
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
      <p className="mr-auto flex items-center gap-1.5 text-sm" role="status" aria-live="polite">
        {pending ? <span className="text-slate-600">Saving…</span>
          : unsaved ? <><CloudOff className="h-4 w-4 text-amber-600" /><span className="text-amber-800"><b>{unsaved}</b> not saved yet <span className="hidden text-xs text-slate-500 sm:inline">(kept on this device until you save)</span></span></>
          : <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-800">All saved</span></>}
      </p>
      {extra}
      <SubmitButton disabled={disabled} variant={variant}>{label}</SubmitButton>
    </div>
  );
}
