"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input, Select } from "./ui/input";
import { Button } from "./ui/button";

/** GET-form filter bar: search box + selects. Updates the URL so results are server-rendered and shareable. */
export function FilterBar({
  searchPlaceholder, filters = [], children,
}: {
  searchPlaceholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[]; allowAll?: boolean; value?: string }[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim()) q.set(k, v.trim());
      else q.delete(k);
    }
    q.delete("page");
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
      {searchPlaceholder !== undefined && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input name="q" defaultValue={params.get("q") ?? ""} placeholder={searchPlaceholder} className="pl-8" aria-label="Search" />
        </div>
      )}
      {filters.map((f) => (
        <Select
          key={f.name}
          name={f.name}
          defaultValue={params.get(f.name) ?? f.value ?? ""}
          aria-label={f.label}
          className="w-auto min-w-[140px]"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {f.allowAll !== false && <option value="">{f.label}: All</option>}
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ))}
      {children}
      <Button type="submit" variant="secondary">Apply</Button>
    </form>
  );
}
