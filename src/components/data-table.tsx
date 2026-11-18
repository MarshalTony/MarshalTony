import Link from "next/link";
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SP = Record<string, string | string[] | undefined>;

export function sp(params: SP, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

export function pageParams(params: SP, pageSize = 25) {
  const page = Math.max(1, Number(sp(params, "page")) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function hrefWith(base: string, params: SP, changes: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) q.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-200 bg-white", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", className)}>{children}</th>;
}
export function TD({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-3 py-2 align-middle text-slate-700", className)}>{children}</td>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", className)}>{children}</tr>;
}

/** Sortable header rendered as a link (works without client JavaScript). */
export function SortTH({ label, field, base, params, className }: { label: string; field: string; base: string; params: SP; className?: string }) {
  const cur = sp(params, "sort");
  const dir = sp(params, "dir") === "desc" ? "desc" : "asc";
  const active = cur === field;
  const next = active && dir === "asc" ? "desc" : "asc";
  return (
    <TH className={className}>
      <Link href={hrefWith(base, params, { sort: field, dir: next, page: undefined })} className="inline-flex items-center gap-1 hover:text-slate-800">
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </Link>
    </TH>
  );
}

export function sortParams<T extends string>(params: SP, allowed: readonly T[], fallback: T): { field: T; dir: "asc" | "desc" } {
  const s = sp(params, "sort") as T | undefined;
  return { field: s && allowed.includes(s) ? s : fallback, dir: sp(params, "dir") === "desc" ? "desc" : "asc" };
}

export function Pagination({ base, params, total, page, pageSize }: { base: string; params: SP; total: number; page: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        Showing {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <PageLink disabled={page <= 1} href={hrefWith(base, params, { page: String(page - 1) })} label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>
        <span className="px-2">
          Page {page} of {pages}
        </span>
        <PageLink disabled={page >= pages} href={hrefWith(base, params, { page: String(page + 1) })} label="Next">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({ disabled, href, children, label }: { disabled: boolean; href: string; children: React.ReactNode; label: string }) {
  const cls = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white";
  if (disabled) return <span className={cn(cls, "opacity-40")} aria-label={label}>{children}</span>;
  return <Link href={href} className={cn(cls, "hover:bg-slate-50")} aria-label={label}>{children}</Link>;
}
