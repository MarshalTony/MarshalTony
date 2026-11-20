import { requirePage, can } from "@/server/auth";
import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui/card";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("settings.manage", "users.manage", "roles.manage", "audit.view", "backup.manage");
  const tabs = [
    can(user, "settings.manage") && { href: "/settings", label: "School profile" },
    can(user, "settings.manage") && { href: "/settings/academic", label: "Years & terms" },
    can(user, "settings.manage") && { href: "/settings/classes", label: "Classes & streams" },
    can(user, "settings.manage", "exams.manage") && { href: "/settings/grading", label: "Grading & ranking" },
    can(user, "settings.manage") && { href: "/settings/lists", label: "Lists & templates" },
    can(user, "users.manage") && { href: "/settings/users", label: "Users" },
    can(user, "roles.manage") && { href: "/settings/roles", label: "Roles & permissions" },
    can(user, "audit.view") && { href: "/settings/audit", label: "Audit & logins" },
    can(user, "backup.manage") && { href: "/settings/backup", label: "Backup" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <>
      <PageHeader title="Settings" description="School configuration. Changes here take effect immediately, without code changes." />
      <Tabs tabs={tabs} />
      {children}
    </>
  );
}
