import type { PermissionCode } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; perms: PermissionCode[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "home", perms: [] }] },
  {
    label: "People",
    items: [
      { href: "/students", label: "Students", icon: "users", perms: ["students.view"] },
      { href: "/guardians", label: "Parents & Guardians", icon: "heart", perms: ["guardians.manage"] },
      { href: "/staff", label: "Staff", icon: "briefcase", perms: ["staff.view"] },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/academics", label: "Classes & Subjects", icon: "book", perms: ["academics.view"] },
      { href: "/timetable", label: "Timetables", icon: "clock", perms: ["academics.view"] },
      { href: "/exams", label: "Examinations", icon: "clipboard", perms: ["exams.manage", "marks.enter", "marks.approve", "results.view"] },
      { href: "/report-cards", label: "Report Cards", icon: "file", perms: ["reportcards.generate"] },
      { href: "/attendance", label: "Attendance", icon: "check", perms: ["attendance.take", "attendance.view", "attendance.staff"] },
      { href: "/learning", label: "Assignments & Materials", icon: "library", perms: ["learning.manage"] },
      { href: "/uneb", label: "UNEB Candidates", icon: "award", perms: ["uneb.manage"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/fees", label: "School Fees", icon: "wallet", perms: ["fees.view", "fees.collect"] },
      { href: "/finance", label: "Accounts & Expenditure", icon: "landmark", perms: ["finance.view", "finance.manage"] },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/hr", label: "HR, Leave & Payroll", icon: "idcard", perms: [] },
      { href: "/library", label: "Library", icon: "library", perms: ["library.manage"] },
      { href: "/inventory", label: "Inventory", icon: "package", perms: ["inventory.manage"] },
      { href: "/welfare", label: "Discipline & Welfare", icon: "shield", perms: ["discipline.manage", "welfare.confidential"] },
      { href: "/transport", label: "Transport", icon: "bus", perms: ["transport.manage"] },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "/announcements", label: "Announcements & Calendar", icon: "megaphone", perms: [] },
      { href: "/messages", label: "SMS / Email / WhatsApp", icon: "message", perms: ["communication.send"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/reports", label: "Reports", icon: "chart", perms: ["results.view", "fees.view", "finance.view", "students.view"] },
      { href: "/imports", label: "Excel Imports", icon: "file", perms: ["students.import", "staff.manage", "fees.reverse", "academics.manage", "attendance.take"] },
      { href: "/settings", label: "Settings", icon: "settings", perms: ["settings.manage", "users.manage", "roles.manage", "audit.view"] },
    ],
  },
];

export function navFor(perms: Set<string>): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.perms.length === 0 || i.perms.some((p) => perms.has(p))) })).filter((g) => g.items.length);
}
