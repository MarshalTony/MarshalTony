"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award, Bell, Book, BookOpen, Briefcase, Bus, ChartBar, Check, Clipboard, Clock, FileText, Heart, Home, IdCard, Landmark,
  LogOut, Menu, Megaphone, MessageSquare, Package, Search, Settings, Shield, Users, Wallet, X, KeyRound,
} from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home, users: Users, heart: Heart, briefcase: Briefcase, book: Book, clock: Clock, clipboard: Clipboard, file: FileText,
  check: Check, library: BookOpen, award: Award, wallet: Wallet, landmark: Landmark, idcard: IdCard, package: Package, shield: Shield,
  bus: Bus, megaphone: Megaphone, message: MessageSquare, chart: ChartBar, settings: Settings,
};

export function AppShell({
  nav, user, school, notifications, canSearchStudents, logout, children, period,
}: {
  nav: NavGroup[]; user: { fullName: string; roles: string[] }; school: { name: string; logo: React.ReactNode };
  notifications: { id: string; title: string; urgent: boolean }[]; canSearchStudents: boolean;
  logout: () => Promise<void>; children: React.ReactNode;
  /** Current academic year and term, e.g. "2026 · Term 3" (links to the switcher for admins). */
  period?: { label: string; href: string | null };
}) {
  const [open, setOpen] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  React.useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-brand-800 px-4 py-4">
        {school.logo}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{school.name}</p>
          <p className="text-xs text-brand-200">SMIS</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {nav.map((g) => (
          <div key={g.label} className="mb-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{g.label}</p>
            {g.items.map((i) => {
              const Icon = ICONS[i.icon] ?? Home;
              const active = pathname === i.href || pathname.startsWith(i.href + "/");
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                    active ? "bg-white/15 font-medium text-white" : "text-brand-100 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-900 shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded p-1 text-white" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <button onClick={() => setOpen(true)} className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          {canSearchStudents ? (
            <form
              className="relative max-w-md flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q");
                router.push(`/students?q=${encodeURIComponent(String(q ?? ""))}`);
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input name="q" placeholder="Search students by name or admission no." className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </form>
          ) : <div className="flex-1" />}
          <div className="ml-auto flex items-center gap-1">
            {period && (period.href
              ? <Link href={period.href} title="Current academic year and term — click to switch" className="mr-1 hidden whitespace-nowrap rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100 sm:inline-block">{period.label}</Link>
              : <span title="Current academic year and term" className="mr-1 hidden whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 sm:inline-block">{period.label}</span>)}
            <div className="relative">
              <button onClick={() => setBell(!bell)} className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
              </button>
              {bell && (
                <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Announcements</p>
                  {notifications.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Nothing new.</p>}
                  {notifications.map((n) => (
                    <Link key={n.id} href="/announcements" onClick={() => setBell(false)} className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                      {n.urgent && <span className="mr-1 text-red-600">●</span>}{n.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-800">{user.fullName}</p>
              <p className="text-xs leading-tight text-slate-500">{user.roles.join(", ")}</p>
            </div>
            <Link href="/change-password" className="rounded-full p-2 text-slate-600 hover:bg-slate-100" title="Change password" aria-label="Change password"><KeyRound className="h-5 w-5" /></Link>
            <form action={logout}>
              <button className="rounded-full p-2 text-slate-600 hover:bg-slate-100" title="Sign out" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
