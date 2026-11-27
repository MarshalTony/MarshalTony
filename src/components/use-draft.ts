"use client";
import * as React from "react";
import { applyDraft, changedCells, parseDraft } from "@/lib/drafts";

const store = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
  del(k: string) { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

/**
 * Marks-entry state that survives a lost connection, a closed tab or a flat battery: every change is kept on this
 * device until the server has it. Returns the values, a setter, how many cells are not saved yet, and a notice about
 * restored work (with a way to throw it away). Warns before leaving the page with unsaved changes.
 */
export function useDraft(key: string, server: Record<string, string>) {
  const [values, setValues] = React.useState(server);
  const [notice, setNotice] = React.useState<string | null>(null);
  const loaded = React.useRef(false);
  const restoring = React.useRef(false);
  const hadChanges = React.useRef(false);

  // Restore once, after mount (localStorage is not available while rendering on the server).
  React.useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const d = parseDraft(store.get(key));
    if (!d) return;
    const r = applyDraft(server, d);
    if (r.restored) {
      restoring.current = true;
      setValues(r.values);
      const when = new Date(d.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      setNotice(`${r.restored} unsaved entr${r.restored === 1 ? "y was" : "ies were"} brought back from this device (typed ${when}). Check them and press Save.${r.skipped ? ` ${r.skipped} were skipped because someone saved those since.` : ""}`);
    } else store.del(key);
  }, [key, server]);

  const dirty = React.useMemo(() => changedCells(values, server), [values, server]);
  const count = Object.keys(dirty).length;

  // Keep the draft in step with what is typed; clear it once everything is saved (server values match).
  React.useEffect(() => {
    if (!loaded.current) return;
    if (restoring.current) { restoring.current = false; return; } // restored values arrive on the next render
    if (count) { store.set(key, JSON.stringify({ savedAt: Date.now(), cells: dirty })); hadChanges.current = true; }
    else {
      store.del(key);
      if (hadChanges.current) setNotice(null); // everything saved → the notice has done its job
      hadChanges.current = false;
    }
  }, [key, dirty, count]);

  React.useEffect(() => {
    if (!count) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [count]);

  const set = React.useCallback((k: string, v: string) => setValues((p) => ({ ...p, [k]: v })), []);
  const discard = React.useCallback(() => { store.del(key); setValues(server); setNotice(null); }, [key, server]);
  return { values, set, unsaved: count, notice, discard };
}
