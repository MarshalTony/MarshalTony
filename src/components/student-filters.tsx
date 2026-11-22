"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Input, Label, Select } from "./ui/input";

type Opt = { value: string; label: string };
type Cls = { id: string; name: string; level: string; streams: { id: string; name: string }[] };

/**
 * Student list filters. Typing searches as you go (short pause); every other control applies at once.
 * The stream list follows the chosen class, and the subject list follows the class level.
 */
export function StudentFilters({
  classes, subjects, combinations, missing, statuses, houses = [], clubs = [],
}: {
  classes: Cls[]; subjects: (Opt & { level: string })[]; combinations: Opt[]; missing: readonly Opt[]; statuses: Opt[]; houses?: Opt[]; clubs?: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const get = (k: string) => params.get(k) ?? "";
  const cls = classes.find((c) => c.id === get("classId"));

  function push(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Search as you type (after a short pause), but not on the first render.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => { if (q.trim() !== get("q")) push({ q: q.trim() }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // Keep the box in step when the URL changes elsewhere (e.g. the header search or "Clear filters").
  React.useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);

  const level = cls?.level;
  const subjectOpts = subjects.filter((s) => !level || s.level === level);
  const active = ["q", "classId", "streamId", "gender", "residence", "subjectId", "combinationId", "house", "club", "reported", "missing"].some((k) => get(k)) || (get("status") && get("status") !== "ACTIVE");

  const sel = (name: string, label: string, options: Opt[], opts: { all?: string; onChange?: (v: string) => void; value?: string } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`f-${name}`} className="text-xs text-slate-500">{label}</Label>
      <Select id={`f-${name}`} value={opts.value ?? get(name)} onChange={(e) => (opts.onChange ? opts.onChange(e.target.value) : push({ [name]: e.target.value }))} className="h-9 w-full">
        {opts.all !== undefined && <option value="">{opts.all}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          aria-label="Search students"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); push({ q: q.trim() }); } }}
          placeholder="Search: name, admission no., LIN, SchoolPay code, UNEB index, class (S1), or a parent's name / phone"
          className="pl-8 pr-8"
        />
        {pending ? <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-slate-400" />
          : q && <button type="button" aria-label="Clear search" onClick={() => { setQ(""); push({ q: "" }); }} className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sel("classId", "Class", classes.map((c) => ({ value: c.id, label: c.name })), {
          all: "All classes",
          onChange: (v) => {
            const lvl = classes.find((c) => c.id === v)?.level;
            const subj = subjects.find((s) => s.value === get("subjectId"));
            push({ classId: v, streamId: "", ...(subj && lvl && subj.level !== lvl ? { subjectId: "" } : {}), ...(lvl === "O_LEVEL" ? { combinationId: "" } : {}) });
          },
        })}
        {sel("streamId", "Stream", cls ? cls.streams.map((s) => ({ value: s.id, label: s.name })) : classes.flatMap((c) => c.streams.map((s) => ({ value: s.id, label: `${c.name} ${s.name}` }))), { all: "All streams" })}
        {sel("gender", "Sex", [{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }], { all: "Both" })}
        {sel("residence", "Day / boarding", [{ value: "DAY", label: "Day" }, { value: "BOARDING", label: "Boarding" }], { all: "Both" })}
        {sel("subjectId", "Takes subject", subjectOpts, { all: "Any subject" })}
        {level !== "O_LEVEL" && combinations.length > 0 ? sel("combinationId", "Combination", combinations, { all: "Any" }) : null}
        {houses.length > 0 ? sel("house", "House", [...houses, { value: "none", label: "No house" }], { all: "Any" }) : null}
        {clubs.length > 0 ? sel("club", "Club", [...clubs, { value: "none", label: "In no club" }], { all: "Any" }) : null}
        {sel("reported", "Reported this term", [{ value: "yes", label: "Yes (confirmed)" }, { value: "no", label: "No (not confirmed)" }], { all: "Any" })}
        {sel("missing", "Missing info", [...missing], { all: "—" })}
        {sel("status", "Status", statuses, { value: get("status") || "ACTIVE" })}
      </div>
      {active && (
        <div className="flex justify-end">
          <Link href={pathname} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><X className="h-3 w-3" />Clear all filters</Link>
        </div>
      )}
    </div>
  );
}
