"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Input, Label, Select } from "./ui/input";

type Opt = { value: string; label: string };
type Cls = { id: string; name: string; level: string; streams: { id: string; name: string }[] };

const SEX: Opt[] = [{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }];
const RESIDENCE: Opt[] = [{ value: "DAY", label: "Day" }, { value: "BOARDING", label: "Boarding" }];
const REPORTED: Opt[] = [{ value: "yes", label: "Yes (confirmed)" }, { value: "no", label: "No (not confirmed)" }];

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

  const streamOpts = cls ? cls.streams.map((s) => ({ value: s.id, label: s.name })) : classes.flatMap((c) => c.streams.map((s) => ({ value: s.id, label: `${c.name} ${s.name}` })));
  const houseOpts = [...houses, { value: "none", label: "No house" }];
  const clubOpts = [...clubs, { value: "none", label: "In no club" }];
  // The extra filters live under "More filters"; it opens by itself when one of them is in use.
  const MORE = ["subjectId", "combinationId", "house", "club", "reported", "missing"];
  const moreCount = MORE.filter((k) => get(k)).length + (get("status") && get("status") !== "ACTIVE" ? 1 : 0);
  const [more, setMore] = React.useState(moreCount > 0);
  // Every filter in use, as a removable chip.
  const name = (opts: Opt[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  type Chip = { key: string; label: string; value: string; clear: Record<string, string> };
  const chips = ([
    get("q") && { key: "q", label: "Search", value: `“${get("q")}”`, clear: { q: "" } },
    get("classId") && { key: "classId", label: "Class", value: cls?.name ?? "", clear: { classId: "", streamId: "" } },
    get("streamId") && { key: "streamId", label: "Stream", value: name(streamOpts, get("streamId")), clear: { streamId: "" } },
    get("gender") && { key: "gender", label: "Sex", value: name(SEX, get("gender")), clear: { gender: "" } },
    get("residence") && { key: "residence", label: "Day / boarding", value: name(RESIDENCE, get("residence")), clear: { residence: "" } },
    get("subjectId") && { key: "subjectId", label: "Takes", value: name(subjects, get("subjectId")), clear: { subjectId: "" } },
    get("combinationId") && { key: "combinationId", label: "Combination", value: name(combinations, get("combinationId")).split(" — ")[0], clear: { combinationId: "" } },
    get("house") && { key: "house", label: "House", value: name(houseOpts, get("house")), clear: { house: "" } },
    get("club") && { key: "club", label: "Club", value: name(clubOpts, get("club")), clear: { club: "" } },
    get("reported") && { key: "reported", label: "Reported this term", value: name(REPORTED, get("reported")).split(" (")[0], clear: { reported: "" } },
    get("missing") && { key: "missing", label: "Missing", value: name([...missing], get("missing")).replace(/^No /, ""), clear: { missing: "" } },
    get("status") && get("status") !== "ACTIVE" && { key: "status", label: "Status", value: name(statuses, get("status")), clear: { status: "" } },
  ] as (Chip | false | "")[]).filter((c): c is Chip => !!c);

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
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex-1 sm:grid-cols-4">
          {sel("classId", "Class", classes.map((c) => ({ value: c.id, label: c.name })), {
            all: "All classes",
            onChange: (v) => {
              const lvl = classes.find((c) => c.id === v)?.level;
              const subj = subjects.find((s) => s.value === get("subjectId"));
              push({ classId: v, streamId: "", ...(subj && lvl && subj.level !== lvl ? { subjectId: "" } : {}), ...(lvl === "O_LEVEL" ? { combinationId: "" } : {}) });
            },
          })}
          {sel("streamId", "Stream", streamOpts, { all: "All streams" })}
          {sel("gender", "Sex", SEX, { all: "Both" })}
          {sel("residence", "Day / boarding", RESIDENCE, { all: "Both" })}
        </div>
        <button
          type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
          className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-sm sm:w-auto ${moreCount ? "border-brand-300 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <SlidersHorizontal className="h-4 w-4" />More filters{moreCount ? <span className="rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">{moreCount}</span> : null}
          <ChevronDown className={`h-4 w-4 transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
      </div>
      {more && (
        <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-3 lg:grid-cols-4">
          {sel("subjectId", "Takes subject", subjectOpts, { all: "Any subject" })}
          {level !== "O_LEVEL" && combinations.length > 0 ? sel("combinationId", "Combination", combinations, { all: "Any" }) : null}
          {houses.length > 0 ? sel("house", "House", houseOpts, { all: "Any" }) : null}
          {clubs.length > 0 ? sel("club", "Club", clubOpts, { all: "Any" }) : null}
          {sel("reported", "Reported this term", REPORTED, { all: "Any" })}
          {sel("missing", "Missing information", [...missing], { all: "Any" })}
          {sel("status", "Status", statuses, { value: get("status") || "ACTIVE" })}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Showing:</span>
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => c.key === "q" ? (setQ(""), push({ q: "" })) : push(c.clear)} title="Remove this filter"
              className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs text-brand-900 hover:border-brand-400">
              <span className="text-brand-700">{c.label}:</span> {c.value}<X className="h-3 w-3" />
            </button>
          ))}
          <Link href={pathname} className="ml-1 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><X className="h-3 w-3" />Clear all</Link>
        </div>
      )}
    </div>
  );
}
