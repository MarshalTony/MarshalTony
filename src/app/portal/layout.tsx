import Link from "next/link";
import { LogOut, KeyRound } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { getSchool } from "@/server/school";
import { SchoolLogo } from "@/components/logo";
import { ThemeStyle } from "@/components/theme-style";
import { logoutAction } from "@/server/actions/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, school] = await Promise.all([getCurrentUser(), getSchool()]);
  const isStaff = user?.roles.some((r) => r !== "PARENT" && r !== "STUDENT");
  return (
    <div className="min-h-screen">
      <ThemeStyle />
      <header className="no-print border-b border-brand-800 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <SchoolLogo fileId={school.logoFileId} size={36} tile />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{school.name}</p>
            <p className="text-xs text-brand-200">{user?.roles.includes("PARENT") ? "Parent portal" : "Student portal"}</p>
          </div>
          {isStaff && <Link href="/dashboard" className="text-xs text-brand-100 underline">Staff dashboard</Link>}
          <span className="hidden text-sm sm:inline">{user?.fullName}</span>
          <Link href="/change-password" className="rounded p-1.5 hover:bg-white/10" aria-label="Change password"><KeyRound className="h-5 w-5" /></Link>
          <form action={logoutAction}><button className="rounded p-1.5 hover:bg-white/10" aria-label="Sign out"><LogOut className="h-5 w-5" /></button></form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
