import { redirect } from "next/navigation";
import { requirePage, homeFor } from "@/server/auth";
import { navFor } from "@/lib/nav";
import { getSchool } from "@/server/school";
import { AppShell } from "@/components/shell";
import { SchoolLogo } from "@/components/logo";
import { logoutAction } from "@/server/actions/auth";
import { visibleAnnouncements } from "@/server/queries/announcements";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  // Parents and students use the portals, never the staff shell.
  if (!user.roles.some((r) => r !== "PARENT" && r !== "STUDENT")) redirect(homeFor(user.roles));
  const school = await getSchool();
  const notes = await visibleAnnouncements(user, 5);
  return (
    <AppShell
      nav={navFor(user.permissions)}
      user={{ fullName: user.fullName, roles: user.roles }}
      school={{ name: school.name, logo: <SchoolLogo fileId={school.logoFileId} size={36} /> }}
      notifications={notes.map((n) => ({ id: n.id, title: n.title, urgent: n.isUrgent }))}
      canSearchStudents={user.permissions.has("students.view")}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
