/**
 * Permission catalogue. Codes are stable identifiers checked on the server.
 * Role → permission mappings below are only the *initial* defaults; administrators
 * can change them from Settings → Roles & Permissions without touching code.
 */
export const PERMISSIONS = {
  // System
  "settings.manage": "Manage school settings, academic structure and configuration",
  "users.manage": "Create users, assign roles, activate/deactivate accounts",
  "roles.manage": "Edit roles and permissions",
  "audit.view": "View audit logs and login history",
  "backup.manage": "Download database backups",
  // Students
  "students.view": "View student records",
  "students.manage": "Register and edit students, promotions, transfers, withdrawals",
  "students.import": "Import students from Excel",
  "guardians.manage": "Manage parents/guardians and portal accounts",
  // Staff / HR
  "staff.view": "View staff directory",
  "staff.manage": "Register and edit staff",
  "hr.sensitive": "View salary, bank and statutory numbers of staff",
  "hr.leave.approve": "Approve or reject leave requests",
  "payroll.manage": "Prepare and approve payroll and salary advances",
  // Academics
  "academics.manage": "Manage subjects, combinations, allocations, timetables, calendar",
  "academics.view": "View academic structure and timetables",
  // Exams
  "exams.manage": "Create exams, configure subjects, grading and generate results",
  "marks.enter": "Enter marks for allocated subjects",
  "marks.enter.any": "Enter marks for any subject/stream",
  "marks.approve": "Approve or reject submitted marks; correct approved marks",
  "results.view": "View examination results and analysis",
  "reports.comment.class": "Write class teacher comments",
  "reports.comment.dos": "Write DOS comments",
  "reports.comment.head": "Write headteacher comments",
  "reportcards.generate": "Generate and print report cards",
  // Finance
  "fees.view": "View fees structures, balances and statements",
  "fees.manage": "Manage fee structures and issue invoices",
  "fees.collect": "Record fee payments and issue receipts",
  "fees.reverse": "Reverse payments and approve fee adjustments, discounts, scholarships",
  "finance.view": "View accounting reports",
  "finance.manage": "Record income, expenses, suppliers, purchase orders, petty cash, budgets",
  "finance.approve": "Approve expenses and payment vouchers",
  // Operations
  "attendance.take": "Take student attendance",
  "attendance.view": "View attendance reports",
  "attendance.staff": "Record staff attendance",
  "library.manage": "Manage library books and loans",
  "inventory.manage": "Manage inventory and stock",
  "discipline.manage": "Record discipline incidents",
  "welfare.confidential": "View and record counselling and medical records",
  "transport.manage": "Manage transport, vehicles and routes",
  "uneb.manage": "Manage UNEB candidate registration records",
  "communication.send": "Send SMS/Email/WhatsApp messages",
  "announcements.manage": "Publish announcements and calendar events",
  "learning.manage": "Publish assignments and learning materials",
  // Portals
  "portal.parent": "Access the parent portal",
  "portal.student": "Access the student portal",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export function permissionModule(code: string) {
  return code.split(".")[0];
}

const STAFF_BASE: PermissionCode[] = ["academics.view", "students.view", "staff.view"];

export const DEFAULT_ROLES: { code: string; name: string; description: string; permissions: PermissionCode[] }[] = [
  { code: "ADMIN", name: "System Administrator", description: "Full system access", permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("portal.")) },
  {
    code: "HEADTEACHER", name: "Headteacher", description: "School head",
    permissions: [
      ...STAFF_BASE, "settings.manage", "users.manage", "audit.view", "students.manage", "guardians.manage", "staff.manage",
      "hr.sensitive", "hr.leave.approve", "payroll.manage", "academics.manage", "exams.manage", "marks.approve", "results.view",
      "reports.comment.head", "reportcards.generate", "fees.view", "fees.reverse", "finance.view", "finance.approve",
      "attendance.view", "attendance.staff", "discipline.manage", "welfare.confidential", "uneb.manage", "communication.send",
      "announcements.manage",
    ],
  },
  {
    code: "DEPUTY", name: "Deputy Headteacher", description: "Deputy head",
    permissions: [
      ...STAFF_BASE, "students.manage", "guardians.manage", "staff.manage", "hr.leave.approve", "academics.manage", "results.view",
      "reports.comment.head", "reportcards.generate", "fees.view", "finance.view", "attendance.take", "attendance.view",
      "attendance.staff", "discipline.manage", "welfare.confidential", "communication.send", "announcements.manage",
    ],
  },
  {
    code: "DOS", name: "Director of Studies", description: "Academic administration",
    permissions: [
      ...STAFF_BASE, "academics.manage", "exams.manage", "marks.enter.any", "marks.enter", "marks.approve", "results.view",
      "reports.comment.dos", "reportcards.generate", "attendance.view", "uneb.manage", "announcements.manage", "learning.manage",
      "communication.send",
    ],
  },
  {
    code: "BURSAR", name: "Bursar", description: "Finance office",
    permissions: [
      ...STAFF_BASE, "fees.view", "fees.manage", "fees.collect", "fees.reverse", "finance.view", "finance.manage", "payroll.manage",
      "inventory.manage", "communication.send",
    ],
  },
  {
    code: "REGISTRAR", name: "Registrar", description: "Admissions and records",
    permissions: [...STAFF_BASE, "students.manage", "students.import", "guardians.manage", "uneb.manage", "fees.view", "transport.manage"],
  },
  {
    code: "CLASS_TEACHER", name: "Class Teacher", description: "Responsible for a stream",
    permissions: [...STAFF_BASE, "attendance.take", "attendance.view", "reports.comment.class", "results.view", "reportcards.generate", "discipline.manage"],
  },
  {
    code: "TEACHER", name: "Subject Teacher", description: "Teaching staff",
    permissions: [...STAFF_BASE, "marks.enter", "attendance.take", "learning.manage"],
  },
  { code: "LIBRARIAN", name: "Librarian", description: "Library", permissions: [...STAFF_BASE, "library.manage"] },
  { code: "STOREKEEPER", name: "Store Keeper", description: "Stores and inventory", permissions: [...STAFF_BASE, "inventory.manage"] },
  { code: "NURSE", name: "School Nurse / Counsellor", description: "Health and welfare", permissions: ["students.view", "welfare.confidential"] },
  { code: "TRANSPORT", name: "Transport Officer", description: "Transport", permissions: ["students.view", "transport.manage"] },
  { code: "PARENT", name: "Parent / Guardian", description: "Parent portal", permissions: ["portal.parent"] },
  { code: "STUDENT", name: "Student", description: "Student portal", permissions: ["portal.student"] },
];
