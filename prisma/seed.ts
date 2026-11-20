/**
 * Production-safe seed: configuration only (no students, staff or money).
 * Idempotent — safe to run repeatedly. Values marked "confirm" should be
 * reviewed by the school in Settings after first login.
 */
import { PrismaClient, type Level, type SubjectCategory } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PERMISSIONS, DEFAULT_ROLES, permissionModule } from "../src/lib/permissions";
import { DEFAULT_PAPER_BANDS } from "../src/lib/uace";

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// O-Level (competency-based) end-of-term grades, as printed on the school's report card
const O_LEVEL_BANDS = [
  { grade: "A", minScore: 90, maxScore: 100, points: 5, remark: "Exceptional", description: "Demonstrates an extraordinary level of competency by applying innovatively and creatively the acquired knowledge and skills in real life situations" },
  { grade: "B", minScore: 80, maxScore: 89.99, points: 4, remark: "Outstanding", description: "Demonstrates high level of competency by applying the acquired knowledge and skills in real life situations" },
  { grade: "C", minScore: 60, maxScore: 79.99, points: 3, remark: "Satisfactory", description: "Demonstrates an adequate level of competency by applying the acquired knowledge and skills in real life situations" },
  { grade: "D", minScore: 50, maxScore: 59.99, points: 2, remark: "Basic", description: "Demonstrates a minimum level of competency by applying the acquired knowledge and skills in real life situations" },
  { grade: "E", minScore: 0, maxScore: 49.99, points: 1, remark: "Elementary", description: "Demonstrates below the basic level of competency by applying the acquired knowledge and skills in real life situations" },
];

async function main() {
  // ---- School profile ----
  await prisma.schoolSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Bishop Ogez High School",
      motto: "We strive for knowledge and excellence",
      poBox: "P.O. Box 175, Bushenyi",
      altPhone: "0772984381",
      altEmail: "info@bishopogez.com",
      website: "www.bishopogez.com",
      email: "ogezhigh@gmail.com",
      phone: "+256 772 314 931",
      address: "Bushenyi, Uganda",
      reportFooter: "This Report is invalid, without school Stamp",
      reportTemplate: {
        showPhoto: true, showSubjectPositions: true, showStreamPosition: true, showClassPosition: true,
        showAttendance: true, showGradingKey: true, classTeacherLabel: "Class Teacher", dosLabel: "Director of Studies",
        headLabel: "Headteacher",
      },
      notificationPrefs: { smsOnPayment: false, smsOnAbsence: false },
    },
  });

  // ---- Permissions & roles ----
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, update: { description, module: permissionModule(code) }, create: { code, description, module: permissionModule(code) } });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.code, p.id]));
  for (const r of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: r.code } });
    if (existing) continue; // never overwrite permissions an administrator has customised
    await prisma.role.create({
      data: {
        code: r.code, name: r.name, description: r.description, isSystem: true,
        permissions: { create: r.permissions.map((p) => ({ permissionId: permId.get(p)! })) },
      },
    });
  }
  // ADMIN always holds every staff permission (new permissions added in upgrades included)
  const admin = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  for (const p of perms.filter((p) => !p.code.startsWith("portal."))) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: admin.id, permissionId: p.id } }, update: {}, create: { roleId: admin.id, permissionId: p.id } });
  }

  // ---- First administrator ----
  if ((await prisma.user.count()) === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD || `Ogez-${crypto.randomInt(100000, 999999)}-admin`;
    await prisma.user.create({
      data: {
        username: "admin", fullName: "System Administrator", email: "ogezhigh@gmail.com",
        passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true,
        roles: { create: [{ roleId: admin.id }] },
      },
    });
    console.log("\n================================================================");
    console.log(" First administrator created.  Username: admin");
    console.log(` Temporary password: ${password}`);
    console.log(" You will be asked to change it at first sign-in.");
    console.log("================================================================\n");
  }

  // ---- Academic year & terms (confirm dates with the Ministry calendar) ----
  if ((await prisma.academicYear.count()) === 0) {
    const year = await prisma.academicYear.create({ data: { name: "2026", startDate: d("2026-02-02"), endDate: d("2026-12-04"), isCurrent: true } });
    const terms = [
      { number: 1, startDate: "2026-02-02", endDate: "2026-04-24", next: "2026-05-18" },
      { number: 2, startDate: "2026-05-18", endDate: "2026-08-07", next: "2026-08-31" },
      { number: 3, startDate: "2026-08-31", endDate: "2026-11-27", next: "2027-02-01" },
    ];
    const today = new Date();
    for (const t of terms) {
      await prisma.term.create({
        data: {
          academicYearId: year.id, number: t.number, name: `Term ${t.number}`, startDate: d(t.startDate), endDate: d(t.endDate),
          nextTermStart: d(t.next), isCurrent: today >= d(t.startDate) && today <= d(t.next) && t.number === pickTerm(today),
        },
      });
    }
    if ((await prisma.term.count({ where: { isCurrent: true } })) === 0) {
      await prisma.term.update({ where: { academicYearId_number: { academicYearId: year.id, number: 1 } }, data: { isCurrent: true } });
    }
  }

  // ---- Classes & default streams ----
  const classes: [string, string, Level, number][] = [
    ["S1", "Senior 1", "O_LEVEL", 1], ["S2", "Senior 2", "O_LEVEL", 2], ["S3", "Senior 3", "O_LEVEL", 3],
    ["S4", "Senior 4", "O_LEVEL", 4], ["S5", "Senior 5", "A_LEVEL", 5], ["S6", "Senior 6", "A_LEVEL", 6],
  ];
  for (const [code, name, level, order] of classes) {
    const c = await prisma.schoolClass.upsert({ where: { code }, update: {}, create: { code, name, level, order } });
    if ((await prisma.stream.count({ where: { classId: c.id } })) === 0) await prisma.stream.create({ data: { classId: c.id, name: "A" } });
  }

  // ---- Departments ----
  const departments = ["Languages", "Mathematics", "Sciences", "Humanities", "Technical & Vocational", "Administration", "Support Services"];
  for (const name of departments) await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  const dept = Object.fromEntries((await prisma.department.findMany()).map((x) => [x.name, x.id]));

  // ---- Subjects ----
  const subjects: [string, string, Level, SubjectCategory, string, boolean][] = [
    ["ENG", "English Language", "O_LEVEL", "COMPULSORY", "Languages", false],
    ["MTC", "Mathematics", "O_LEVEL", "COMPULSORY", "Mathematics", false],
    ["PHY", "Physics", "O_LEVEL", "COMPULSORY", "Sciences", true],
    ["CHE", "Chemistry", "O_LEVEL", "COMPULSORY", "Sciences", true],
    ["BIO", "Biology", "O_LEVEL", "COMPULSORY", "Sciences", true],
    ["GEO", "Geography", "O_LEVEL", "COMPULSORY", "Humanities", false],
    ["HPE", "History & Political Education", "O_LEVEL", "COMPULSORY", "Humanities", false],
    ["CRE", "Christian Religious Education", "O_LEVEL", "ELECTIVE", "Humanities", false],
    ["ENT", "Entrepreneurship", "O_LEVEL", "COMPULSORY", "Technical & Vocational", false],
    ["KIS", "Kiswahili", "O_LEVEL", "COMPULSORY", "Languages", false],
    ["PE", "Physical Education", "O_LEVEL", "COMPULSORY", "Technical & Vocational", true],
    ["ICT", "Information & Communication Technology", "O_LEVEL", "ELECTIVE", "Technical & Vocational", true],
    ["AGR", "Agriculture", "O_LEVEL", "ELECTIVE", "Sciences", true],
    ["LIT", "Literature in English", "O_LEVEL", "ELECTIVE", "Languages", false],
    ["ART", "Art & Design", "O_LEVEL", "ELECTIVE", "Technical & Vocational", true],
    ["LUG", "Luganda", "O_LEVEL", "ELECTIVE", "Languages", false],
    ["A-PHY", "Physics", "A_LEVEL", "PRINCIPAL", "Sciences", true],
    ["A-CHE", "Chemistry", "A_LEVEL", "PRINCIPAL", "Sciences", true],
    ["A-BIO", "Biology", "A_LEVEL", "PRINCIPAL", "Sciences", true],
    ["A-MTC", "Mathematics", "A_LEVEL", "PRINCIPAL", "Mathematics", false],
    ["A-ECO", "Economics", "A_LEVEL", "PRINCIPAL", "Humanities", false],
    ["A-GEO", "Geography", "A_LEVEL", "PRINCIPAL", "Humanities", false],
    ["A-HIS", "History", "A_LEVEL", "PRINCIPAL", "Humanities", false],
    ["A-LIT", "Literature in English", "A_LEVEL", "PRINCIPAL", "Languages", false],
    ["A-DIV", "Divinity", "A_LEVEL", "PRINCIPAL", "Humanities", false],
    ["A-ENT", "Entrepreneurship", "A_LEVEL", "PRINCIPAL", "Technical & Vocational", false],
    ["A-AGR", "Agriculture", "A_LEVEL", "PRINCIPAL", "Sciences", true],
    ["A-ART", "Fine Art", "A_LEVEL", "PRINCIPAL", "Technical & Vocational", true],
    ["GP", "General Paper", "A_LEVEL", "SUBSIDIARY", "Languages", false],
    ["S-ICT", "Subsidiary ICT", "A_LEVEL", "SUBSIDIARY", "Technical & Vocational", true],
    ["S-MTC", "Subsidiary Mathematics", "A_LEVEL", "SUBSIDIARY", "Mathematics", false],
  ];
  for (const [code, name, level, category, dep, hasPractical] of subjects) {
    // A-Level subjects are sat as 2 papers, except General Paper and Sub-Maths (1 paper).
    const paperCount = level === "A_LEVEL" && code !== "GP" && code !== "S-MTC" ? 2 : 1;
    await prisma.subject.upsert({ where: { code }, update: {}, create: { code, name, level, category, hasPractical, paperCount, departmentId: dept[dep] } });
  }
  const sub = Object.fromEntries((await prisma.subject.findMany()).map((x) => [x.code, x.id]));

  const combos: [string, string, string[]][] = [
    ["PCM", "Physics, Chemistry, Mathematics", ["A-PHY", "A-CHE", "A-MTC", "GP", "S-ICT"]],
    ["PCB", "Physics, Chemistry, Biology", ["A-PHY", "A-CHE", "A-BIO", "GP", "S-MTC"]],
    ["BCM", "Biology, Chemistry, Mathematics", ["A-BIO", "A-CHE", "A-MTC", "GP", "S-ICT"]],
    ["BCA", "Biology, Chemistry, Agriculture", ["A-BIO", "A-CHE", "A-AGR", "GP", "S-MTC"]],
    ["MEG", "Mathematics, Economics, Geography", ["A-MTC", "A-ECO", "A-GEO", "GP", "S-ICT"]],
    ["HEG", "History, Economics, Geography", ["A-HIS", "A-ECO", "A-GEO", "GP", "S-MTC"]],
    ["HED", "History, Economics, Divinity", ["A-HIS", "A-ECO", "A-DIV", "GP", "S-MTC"]],
    ["HEL", "History, Economics, Literature", ["A-HIS", "A-ECO", "A-LIT", "GP", "S-ICT"]],
    ["DEA", "Divinity, Entrepreneurship, Art", ["A-DIV", "A-ENT", "A-ART", "GP", "S-ICT"]],
  ];
  for (const [code, name, list] of combos) {
    const exists = await prisma.subjectCombination.findUnique({ where: { code } });
    if (exists) continue;
    await prisma.subjectCombination.create({ data: { code, name, subjects: { create: list.map((c) => ({ subjectId: sub[c] })) } } });
  }

  // ---- Grading scales (confirm with DOS) ----
  if ((await prisma.gradingScale.count()) === 0) {
    await prisma.gradingScale.create({
      data: {
        name: "O-Level Competency-Based (A–E)", level: "O_LEVEL", appliesTo: "ALL", isDefault: true,
        bands: { create: [
          ...O_LEVEL_BANDS,
        ] },
      },
    });
    await prisma.gradingScale.create({
      data: {
        name: "O-Level Legacy (D1–F9)", level: "O_LEVEL", appliesTo: "ALL", isDefault: false,
        bands: { create: [
          { grade: "D1", minScore: 80, maxScore: 100, points: 1, remark: "Distinction" },
          { grade: "D2", minScore: 75, maxScore: 79.99, points: 2, remark: "Distinction" },
          { grade: "C3", minScore: 70, maxScore: 74.99, points: 3, remark: "Credit" },
          { grade: "C4", minScore: 65, maxScore: 69.99, points: 4, remark: "Credit" },
          { grade: "C5", minScore: 60, maxScore: 64.99, points: 5, remark: "Credit" },
          { grade: "C6", minScore: 55, maxScore: 59.99, points: 6, remark: "Credit" },
          { grade: "P7", minScore: 50, maxScore: 54.99, points: 7, remark: "Pass" },
          { grade: "P8", minScore: 45, maxScore: 49.99, points: 8, remark: "Pass" },
          { grade: "F9", minScore: 0, maxScore: 44.99, points: 9, remark: "Fail" },
        ] },
      },
    });
    await prisma.gradingScale.create({
      data: {
        name: "A-Level Principal", level: "A_LEVEL", appliesTo: "PRINCIPAL", isDefault: true,
        bands: { create: [
          { grade: "A", minScore: 80, maxScore: 100, points: 6, remark: "Excellent" },
          { grade: "B", minScore: 70, maxScore: 79.99, points: 5, remark: "Very good" },
          { grade: "C", minScore: 60, maxScore: 69.99, points: 4, remark: "Good" },
          { grade: "D", minScore: 50, maxScore: 59.99, points: 3, remark: "Fair" },
          { grade: "E", minScore: 45, maxScore: 49.99, points: 2, remark: "Pass" },
          { grade: "O", minScore: 35, maxScore: 44.99, points: 1, remark: "Subsidiary pass" },
          { grade: "F", minScore: 0, maxScore: 34.99, points: 0, remark: "Fail" },
        ] },
      },
    });
    await prisma.gradingScale.create({
      data: {
        name: "A-Level Subsidiary", level: "A_LEVEL", appliesTo: "SUBSIDIARY", isDefault: true,
        bands: { create: [
          { grade: "O", minScore: 50, maxScore: 100, points: 1, remark: "Pass" },
          { grade: "F", minScore: 0, maxScore: 49.99, points: 0, remark: "Fail" },
        ] },
      },
    });
  }
  await prisma.resultRule.upsert({ where: { level: "O_LEVEL" }, update: {}, create: { level: "O_LEVEL", rankingBasis: "AVERAGE", tieMethod: "COMPETITION", absentPolicy: "EXCLUDE", minSubjectsToRank: 1, topClassCount: 12, topStreamCount: 3 } });
  await prisma.resultRule.upsert({ where: { level: "A_LEVEL" }, update: {}, create: { level: "A_LEVEL", rankingBasis: "POINTS", tieMethod: "COMPETITION", absentPolicy: "EXCLUDE", minSubjectsToRank: 1, topClassCount: 12, topStreamCount: 3 } });

  // Upgrade: the original seeded O-Level scale (A ≥ 80) becomes the school's scale (A ≥ 90) — only if untouched.
  const oScale = await prisma.gradingScale.findFirst({ where: { name: "O-Level Competency-Based (A–E)" }, include: { bands: true } });
  const original = oScale && oScale.bands.length === 5 &&
    Number(oScale.bands.find((x) => x.grade === "A")?.minScore) === 80 && Number(oScale.bands.find((x) => x.grade === "B")?.minScore) === 70;
  if (oScale && original) {
    await prisma.gradeBand.deleteMany({ where: { scaleId: oScale.id } });
    await prisma.gradeBand.createMany({ data: O_LEVEL_BANDS.map((x) => ({ ...x, scaleId: oScale.id })) });
    console.log("O-Level grading scale updated to the school's report-card bands.");
  }

  // Report header details from the school's report card — filled only where still empty.
  const sch = await prisma.schoolSetting.findUniqueOrThrow({ where: { id: 1 } });
  const fill: Record<string, string> = {};
  if (!sch.motto) fill.motto = "We strive for knowledge and excellence";
  if (!sch.poBox) fill.poBox = "P.O. Box 175, Bushenyi";
  if (!sch.altPhone) fill.altPhone = "0772984381";
  if (!sch.altEmail) fill.altEmail = "info@bishopogez.com";
  if (!sch.reportFooter || sch.reportFooter === "This report is not valid without the school stamp.") fill.reportFooter = "This Report is invalid, without school Stamp";
  if (Object.keys(fill).length) await prisma.schoolSetting.update({ where: { id: 1 }, data: fill });

  // Activities of Integration identifiers (scores out of 3) — created on upgrade too
  if (!(await prisma.gradingScale.findFirst({ where: { level: "O_LEVEL", appliesTo: "ACTIVITY" } }))) {
    await prisma.gradingScale.create({
      data: {
        name: "Activities of Integration (out of 3)", level: "O_LEVEL", appliesTo: "ACTIVITY", isDefault: true,
        bands: { create: [
          { grade: "3", minScore: 2.5, maxScore: 3, points: 3, remark: "Outstanding", description: "Most or all LOs achieved for overall achievement" },
          { grade: "2", minScore: 1.5, maxScore: 2.49, points: 2, remark: "Moderate", description: "Many LOs achieved, enough for overall achievement" },
          { grade: "1", minScore: 0.1, maxScore: 1.49, points: 1, remark: "Basic", description: "Few LOs achieved, but not sufficient for overall achievement" },
        ] },
      },
    });
  }

  // A-Level paper grades (D1–F9) used on the A-Level report; subject grades A–F come from the paper grades (UACE rules).
  if (!(await prisma.gradingScale.findFirst({ where: { level: "A_LEVEL", appliesTo: "PAPER" } }))) {
    await prisma.gradingScale.create({
      data: {
        name: "A-Level Paper Grades (D1–F9)", level: "A_LEVEL", appliesTo: "PAPER", isDefault: true,
        bands: { create: DEFAULT_PAPER_BANDS },
      },
    });
  }

  // ---- Exam types ----
  const examTypes: [string, string, number][] = [["BOT", "Beginning of Term", 1], ["MOT", "Mid-Term", 2], ["EOT", "End of Term", 3], ["MOCK", "Mock Examinations", 4], ["TERM", "Term Final (combined)", 5]];
  for (const [code, name, order] of examTypes) await prisma.examType.upsert({ where: { code }, update: {}, create: { code, name, order } });

  // ---- Finance configuration ----
  const methods: [string, string][] = [["CASH", "Cash"], ["BANK", "Bank Transfer / Deposit"], ["MTN_MOMO", "MTN Mobile Money"], ["AIRTEL_MONEY", "Airtel Money"], ["CHEQUE", "Cheque"]];
  for (const [code, name] of methods) await prisma.paymentMethod.upsert({ where: { code }, update: {}, create: { code, name } });
  const expenseCats = ["Salaries & Wages", "Food & Catering", "Utilities", "Stationery & Printing", "Repairs & Maintenance", "Transport & Fuel", "Medical", "Examinations", "Sports & Co-curricular", "Administration", "Construction & Development", "Miscellaneous"];
  for (const name of expenseCats) await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });

  // ---- Other configuration ----
  for (const name of ["Textbooks", "Fiction", "Reference", "Science", "Religion", "Revision"]) await prisma.bookCategory.upsert({ where: { name }, update: {}, create: { name } });
  for (const name of ["Stationery", "Uniforms", "Laboratory Equipment", "Computers & ICT", "Furniture", "Kitchen", "Sports", "Cleaning"]) await prisma.inventoryCategory.upsert({ where: { name }, update: {}, create: { name } });

  const templates: [string, string, string, string | null, string][] = [
    ["FEES_REMINDER", "Fees reminder", "SMS", null, "Dear {{guardian}}, {{student}} ({{admissionNo}}) has an outstanding fees balance of {{balance}}. Kindly clear it. Bishop Ogez High School."],
    ["PAYMENT_RECEIVED", "Payment received", "SMS", null, "Dear {{guardian}}, we have received {{amount}} for {{student}}. Receipt {{receiptNo}}. New balance: {{balance}}. Thank you. Bishop Ogez HS."],
    ["ABSENCE_ALERT", "Absence alert", "SMS", null, "Dear {{guardian}}, {{student}} was marked {{status}} on {{date}}. Please contact the school on +256 772 314 931."],
    ["RESULTS_READY", "Results available", "SMS", null, "Dear {{guardian}}, {{exam}} results for {{student}} are available on the parent portal. Bishop Ogez HS."],
    ["GENERAL_NOTICE", "General notice", "EMAIL", "Notice from Bishop Ogez High School", "Dear {{guardian}},\n\n{{message}}\n\nBishop Ogez High School"],
  ];
  for (const [code, name, channel, subject, body] of templates) await prisma.messageTemplate.upsert({ where: { code }, update: {}, create: { code, name, channel, subject, body } });

  // ---- Report-card comment bank (only when empty, so the school's own edits are kept) ----
  if ((await prisma.commentTemplate.count()) === 0) {
    const bank: [string, number, number, string[]][] = [
      ["CLASS_TEACHER", 90, 100, ["Exceptional work, {name}. Keep up this excellent standard.", "{name} has shown outstanding mastery this term. Well done."]],
      ["CLASS_TEACHER", 80, 89.99, ["Very good performance, {name}. Aim even higher next term.", "{name} works hard and achieves very good results. Keep it up."]],
      ["CLASS_TEACHER", 60, 79.99, ["Good effort, {name}. With more practice you can reach the top grades.", "Satisfactory work. {name} should revise weaker subjects consistently."]],
      ["CLASS_TEACHER", 50, 59.99, ["Fair performance. {name} needs to put in more effort and ask for help early.", "{name} has basic understanding; more serious revision is needed."]],
      ["CLASS_TEACHER", 0, 49.99, ["{name} must work much harder. Please see the class teacher with your parent.", "Below expectations. {name} needs close support and regular revision."]],
      ["HEADTEACHER", 90, 100, ["Excellent results. Keep shining.", "Outstanding achievement. Congratulations."]],
      ["HEADTEACHER", 80, 89.99, ["Very good work. Keep the focus.", "Commendable performance. Keep it up."]],
      ["HEADTEACHER", 60, 79.99, ["Good work; there is room for improvement.", "Satisfactory. Aim higher next term."]],
      ["HEADTEACHER", 50, 59.99, ["Fair. More effort is required.", "You can do better. Work harder."]],
      ["HEADTEACHER", 0, 49.99, ["Poor performance. Serious improvement is needed.", "Below average. Parent and student should meet the class teacher."]],
      ["DOS", 90, 100, ["Excellent academic performance."]],
      ["DOS", 80, 89.99, ["Very good results. Maintain the effort."]],
      ["DOS", 60, 79.99, ["Good. Focus on the weaker subjects."]],
      ["DOS", 50, 59.99, ["Fair. Needs more consistent revision."]],
      ["DOS", 0, 49.99, ["Weak results. Requires academic support."]],
    ];
    await prisma.commentTemplate.createMany({ data: bank.flatMap(([role, minScore, maxScore, texts]) => texts.map((text) => ({ role, minScore, maxScore, text }))) });
    console.log("Report-card comment bank created.");
  }

  console.log("Seed complete.");
}

function pickTerm(today: Date) {
  const m = today.getUTCMonth() + 1;
  return m <= 4 ? 1 : m <= 8 ? 2 : 3;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
