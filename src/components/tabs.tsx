"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Tabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="no-print mb-5 flex flex-wrap gap-x-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-brand-700 font-medium text-brand-800" : "border-transparent text-slate-600 hover:text-slate-900")}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
