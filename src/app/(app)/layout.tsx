import { redirect } from "next/navigation";
import { requirePage, homeFor } from "@/server/auth";
import { navFor } from "@/lib/nav";
import { getSchool } from "@/server/school";
import { AppShell } from "@/components/shell";
import { SchoolLogo } from "@/components/logo";
import { logoutAction } from "@/server/actions/auth";
import { visibleAnnouncements } from "@/server/queries/announcements";
import { prisma } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  // Parents and students use the portals, never the staff shell.
  if (!user.roles.some((r) => r !== "PARENT" && r !== "STUDENT")) redirect(homeFor(user.roles));
  const school = await getSchool();
  const [notes, term] = await Promise.all([
    visibleAnnouncements(user, 5),
    prisma.term.findFirst({ where: { isCurrent: true }, select: { name: true, academicYear: { select: { name: true } } } }),
  ]);
  return (
    <AppShell
      nav={navFor(user.permissions)}
      user={{ fullName: user.fullName, roles: user.roles }}
      school={{ name: school.name, logo: <SchoolLogo fileId={school.logoFileId} size={36} /> }}
      notifications={notes.map((n) => ({ id: n.id, title: n.title, urgent: n.isUrgent }))}
      canSearchStudents={user.permissions.has("students.view")}
      period={{ label: term ? `${term.academicYear.name} · ${term.name}` : "No current term", href: user.permissions.has("settings.manage") ? "/settings/academic" : null }}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
