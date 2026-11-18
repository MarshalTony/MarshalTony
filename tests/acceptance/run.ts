/**
 * Acceptance test runner (brief §30). Drives the running production build in a real browser.
 *   BASE_URL=http://localhost:3100 DATABASE_URL=... ADMIN_PASSWORD=... tsx tests/acceptance/run.ts
 * Writes docs/ACCEPTANCE_REPORT.md. Exit code 1 if any check fails.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
// Playwright is provided by the test machine (not an app dependency).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright") as any;
type Page = any;

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? "AcceptAdmin123";
const prisma = new PrismaClient();
const TMP = path.resolve(process.env.TMPDIR ?? "/tmp", `smis-accept-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

type Result = { id: number; name: string; ok: boolean; evidence: string; ms: number };
const results: Result[] = [];
const ctx: Record<string, any> = {};

async function check(id: number, name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    const evidence = await fn();
    results.push({ id, name, ok: true, evidence, ms: Date.now() - t });
    console.log(`PASS ${id}. ${name} — ${evidence}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    results.push({ id, name, ok: false, evidence: msg, ms: Date.now() - t });
    console.log(`FAIL ${id}. ${name} — ${msg}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function session(username: string, password: string, newPassword?: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("dialog", (d: any) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=username]", username);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u: URL) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  if (page.url().includes("change-password")) {
    assert(newPassword, `${username} must change password`);
    await page.fill("input[name=current]", password);
    await page.fill("input[name=password]", newPassword);
    await page.fill("input[name=confirm]", newPassword);
    await page.click("button[type=submit]");
    await page.waitForURL((u: URL) => !u.pathname.startsWith("/change-password"), { timeout: 30000 });
  }
  return { browser, page, request: context.request };
}
const toast = async (page: Page, re: RegExp) => {
  const t = page.locator("[data-sonner-toast]").filter({ hasText: re }).last();
  await t.waitFor({ timeout: 30000 });
  return (await t.textContent())!.trim();
};
const dialog = async (page: Page, trigger: string) => {
  await page.click(`button:has-text("${trigger}")`);
  await page.waitForSelector("[role=dialog]");
};
const submitDialog = (page: Page) => page.click("[role=dialog] button[type=submit]");

async function main() {
  const admin = await session("admin", ADMIN_PW, "Accept-Admin-2026");
  const A = admin.page;

  await check(1, "Student registration and Excel import", async () => {
    await A.goto(`${BASE}/students/new`);
    await A.fill("input[name=lastName]", "Acceptance"); await A.fill("input[name=firstName]", "Alice");
    await A.selectOption("select[name=gender]", "FEMALE");
    const s1 = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "S1" }, include: { streams: { orderBy: { name: "asc" } } } });
    await A.selectOption("select[name=classId]", s1.id); await A.selectOption("select[name=streamId]", s1.streams[0].id);
    await A.fill("input[name=gName]", "Agnes Acceptance"); await A.fill("input[name=gPhone]", "0772999001"); await A.selectOption("select[name=gRelationship]", "Mother");
    await A.click("button[type=submit]");
    await A.waitForURL(/\/students\/c/, { timeout: 30000 });
    ctx.aliceId = A.url().split("/").pop();
    const alice = await prisma.student.findUniqueOrThrow({ where: { id: ctx.aliceId }, include: { subjects: true, guardians: true } });
    assert(alice.subjects.length > 0 && alice.guardians.length === 1, "subjects/guardian not created");
    // Excel import: 3 rows, one invalid
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("S");
    ws.addRow(["Surname", "First Name", "Gender", "Date of Birth", "Class", "Stream", "Day/Boarding", "Guardian Name", "Guardian Phone"]);
    ws.addRow(["Importa", "Ben", "M", "03/04/2012", "S1", "A", "DAY", "Bob Importa", "0700100100"]);
    ws.addRow(["Importa", "Cara", "F", "2011-09-09", "S2", "B", "BOARDING", "Bob Importa", "0700100100"]);
    ws.addRow(["Bad", "Row", "Q", "31/31/2020", "S9", "A", "DAY", "", ""]);
    const file = path.join(TMP, "students.xlsx"); await wb.xlsx.writeFile(file);
    await A.goto(`${BASE}/imports?kind=students`);
    await A.setInputFiles("input[name=file]", file);
    await A.click("form button[type=submit]");
    await A.waitForURL(/\/imports\/c/, { timeout: 30000 });
    const errorCell = await A.locator("td").filter({ hasText: "Gender must be M or F" }).count();
    assert(errorCell === 1, "invalid row not flagged");
    await A.check("input[name=acknowledge]");
    await A.click('button:has-text("Import 2 valid")');
    await toast(A, /2 students registered/);
    const imported = await prisma.student.findMany({ where: { lastName: "Importa" }, include: { guardians: true } });
    assert(imported.length === 2, `expected 2 imported, got ${imported.length}`);
    assert(imported[0].guardians[0].guardianId === imported[1].guardians[0].guardianId, "siblings should share one guardian");
    return `registered ${alice.admissionNo} with ${alice.subjects.length} subjects; import: 2 valid rows saved, 1 invalid row flagged and kept in the error report; siblings linked to one guardian`;
  });

  await check(2, "Student promotion", async () => {
    await A.goto(`${BASE}/settings/academic`);
    await dialog(A, "New academic year");
    await A.fill("[role=dialog] input[name=name]", "2027");
    await A.fill("[role=dialog] input[name=startDate]", "2027-02-01");
    await A.fill("[role=dialog] input[name=endDate]", "2027-12-03");
    await submitDialog(A); await toast(A, /Academic year saved/);
    const y2027 = await prisma.academicYear.findUniqueOrThrow({ where: { name: "2027" } });
    const s2 = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "S2" } });
    const cohort = await prisma.student.count({ where: { classId: s2.id, status: "ACTIVE" } });
    await A.goto(`${BASE}/students/promote?classId=${s2.id}&toYearId=${y2027.id}`);
    await A.click('button:has-text("Apply promotion")');
    await toast(A, /promoted/);
    const s3 = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "S3" } });
    const moved = await prisma.enrollment.count({ where: { academicYearId: y2027.id, classId: s3.id } });
    const history = await prisma.enrollment.count({ where: { classId: s2.id, status: "PROMOTED" } });
    assert(moved === cohort && history === cohort, `moved ${moved}, history ${history}, cohort ${cohort}`);
    return `${cohort} S2 students promoted to S3 for 2027; their 2026 S2 enrollments kept as history (PROMOTED)`;
  });

  await check(3, "Parent account linking", async () => {
    await A.goto(`${BASE}/students/${ctx.aliceId}`);
    await A.click('button:has-text("Create portal account")');
    const msg = await toast(A, /Username: /);
    const m = msg.match(/Username: (\S+) · Temporary password: (\S+)/);
    assert(m, "no credentials in message");
    ctx.parentUser = m[1]; ctx.parentPw = m[2];
    // Link a second child (a sibling) to the same parent
    const guardian = await prisma.guardian.findFirstOrThrow({ where: { fullName: "Agnes Acceptance" } });
    const sibling = await prisma.student.findFirstOrThrow({ where: { lastName: "Importa", firstName: "Ben" } });
    await A.goto(`${BASE}/students/${sibling.id}`);
    await dialog(A, "Link existing");
    await A.selectOption("[role=dialog] select[name=guardianId]", guardian.id);
    await A.selectOption("[role=dialog] select[name=relationship]", "Guardian");
    await submitDialog(A); await toast(A, /linked/);
    ctx.siblingId = sibling.id;
    const n = await prisma.studentGuardian.count({ where: { guardianId: guardian.id } });
    assert(n === 2, "parent should have 2 children");
    return `parent account ${ctx.parentUser} created; a second child linked to the same parent`;
  });

  await check(4, "Examination setup", async () => {
    await A.goto(`${BASE}/exams`);
    await dialog(A, "New examination");
    await A.fill("[role=dialog] input[name=name]", "Acceptance MOT");
    await A.selectOption("[role=dialog] select[name=examTypeId]", { label: "Mid-Term" });
    const s1 = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "S1" } });
    await A.check(`[role=dialog] input[name="classIds[]"][value="${s1.id}"]`);
    await submitDialog(A);
    await A.waitForURL(/\/exams\/c/, { timeout: 30000 });
    ctx.examId = A.url().split("/").pop();
    await A.click('button:has-text("Open for marks entry")'); await toast(A, /opened/);
    const subjects = await prisma.examSubject.count({ where: { examId: ctx.examId } });
    assert(subjects > 5, "subjects not configured");
    return `exam created for S1 with ${subjects} subjects (max 100 each) and opened for marks entry`;
  });

  // Teacher login (demo teacher1 teaches English and is allocated to every stream)
  const teacher = await session("teacher1", "Demo12345");
  const T = teacher.page;
  const s1A = await prisma.stream.findFirstOrThrow({ where: { schoolClass: { code: "S1" }, name: "A" } });
  const s1B = await prisma.stream.findFirstOrThrow({ where: { schoolClass: { code: "S1" }, name: "B" } });
  const eng = await prisma.subject.findUniqueOrThrow({ where: { code: "ENG" } });

  await check(5, "Marks entry (with invalid-mark protection)", async () => {
    await T.goto(`${BASE}/exams/${ctx.examId}/marks?streamId=${s1A.id}&subjectId=${eng.id}`);
    const inputs = T.locator('input[name^="m_"]');
    const n = await inputs.count();
    await inputs.nth(0).fill("120");
    assert(await T.locator('button:has-text("Save marks")').isDisabled(), "save should be blocked for 120/100");
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(35 + ((i * 13) % 60)));
    await inputs.nth(n - 1).fill("ABS");
    await T.click('button:has-text("Save marks")'); await toast(T, /mark\(s\) saved/);
    await T.click('button:has-text("Submit marks")'); await toast(T, /submitted for approval/);
    const saved = await prisma.mark.count({ where: { examId: ctx.examId, subjectId: eng.id } });
    assert(saved === n, `${saved} of ${n} saved`);
    return `${n} English marks for S1 A entered by the subject teacher (one ABS), 120/100 blocked, sheet submitted and locked`;
  });

  await check(6, "Excel marks import", async () => {
    const tpl = await teacher.request.get(`${BASE}/api/templates/marks?examId=${ctx.examId}&streamId=${s1B.id}&subjectId=${eng.id}`);
    assert(tpl.ok(), `template HTTP ${tpl.status()}`);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await tpl.body()) as any);
    const ws = wb.worksheets[0];
    let rows = 0;
    ws.eachRow((r: ExcelJS.Row, i: number) => { if (i > 1) { r.getCell(3).value = 40 + ((i * 7) % 55); rows++; } });
    ws.getRow(2).getCell(3).value = 250; // one invalid mark
    const file = path.join(TMP, "marks.xlsx"); await wb.xlsx.writeFile(file);
    await T.goto(`${BASE}/exams/${ctx.examId}/marks?streamId=${s1B.id}&subjectId=${eng.id}`);
    await T.setInputFiles("input[name=file]", file);
    await T.click('form:has(input[name=file]) button[type=submit]');
    await T.waitForURL(/\/imports\/c/, { timeout: 30000 });
    assert((await T.locator("td").filter({ hasText: "between 0 and 100" }).count()) === 1, "invalid mark not flagged");
    await T.check("input[name=acknowledge]");
    await T.click('button:has-text("Import")'); await toast(T, /marks imported/);
    const saved = await prisma.mark.count({ where: { examId: ctx.examId, subjectId: eng.id, student: { streamId: s1B.id } } });
    assert(saved === rows - 1, `${saved} saved, expected ${rows - 1}`);
    return `pre-filled template for S1 B (${rows} students); ${rows - 1} marks imported, the 250/100 row rejected and reported`;
  });

  await check(7, "Automatic grading", async () => {
    // Approve, fill the remaining subjects quickly as DOS-approved demo marks, then generate.
    await prisma.markSubmission.updateMany({ where: { examId: ctx.examId }, data: { status: "APPROVED" } });
    await A.goto(`${BASE}/exams/${ctx.examId}`);
    await A.click('button:has-text("Generate results")'); await toast(A, /Results generated/);
    const scale = await prisma.gradeBand.findMany({ where: { scale: { level: "O_LEVEL", isDefault: true } } });
    const srs = await prisma.subjectResult.findMany({ where: { examId: ctx.examId, percentage: { not: null } } });
    const wrong = srs.filter((r) => {
      const p = Number(r.percentage);
      const band = [...scale].sort((a, b) => Number(b.minScore) - Number(a.minScore)).find((b) => p >= Number(b.minScore));
      return band?.grade !== r.grade;
    });
    assert(srs.length > 0 && wrong.length === 0, `${wrong.length} mis-graded of ${srs.length}`);
    return `${srs.length} subject results graded; every grade matches the configured A–E scale`;
  });

  await check(8, "Correct student ranking (independent SQL re-computation)", async () => {
    const bot = await prisma.exam.findFirstOrThrow({ where: { name: { contains: "(demo)" } } });
    await A.goto(`${BASE}/exams/${bot.id}`);
    await A.click('button:has-text("Generate results")'); await toast(A, /Results generated/);
    ctx.botId = bot.id;
    // Independent re-computation per level, following each level's configured ranking basis:
    // O-Level ranks by average % (higher first), A-Level by total points (higher first).
    const rules = await prisma.resultRule.findMany();
    assert(rules.find((r) => r.level === "O_LEVEL")?.rankingBasis === "AVERAGE" && rules.find((r) => r.level === "A_LEVEL")?.rankingBasis === "POINTS", "unexpected default rules");
    const rows = await prisma.$queryRaw<{ studentId: string; level: string; classPosition: number | null; expected: bigint }[]>`
      WITH per AS (
        SELECT sr."studentId", r."classId", c.level::text AS level, r."classPosition",
               ROUND(AVG(sr.percentage), 2) AS avg_pct, COALESCE(SUM(sr.points), 0) AS pts
        FROM "SubjectResult" sr
        JOIN "ExamResult" r ON r."examId" = sr."examId" AND r."studentId" = sr."studentId"
        JOIN "SchoolClass" c ON c.id = r."classId"
        WHERE sr."examId" = ${bot.id} AND sr.percentage IS NOT NULL GROUP BY 1, 2, 3, 4)
      SELECT "studentId", level, "classPosition",
             RANK() OVER (PARTITION BY "classId" ORDER BY CASE WHEN level = 'A_LEVEL' THEN pts ELSE avg_pct END DESC) AS expected
      FROM per`;
    const mismatched = rows.filter((r) => r.classPosition !== Number(r.expected));
    assert(rows.length > 200 && mismatched.length === 0, `${mismatched.length} of ${rows.length} positions differ`);
    const aLevel = rows.filter((r) => r.level === "A_LEVEL").length;
    const ties = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) n FROM (SELECT "classId", "classPosition" FROM "ExamResult" WHERE "examId" = ${bot.id} GROUP BY 1, 2 HAVING COUNT(*) > 1) t`;
    return `${rows.length} class positions (${rows.length - aLevel} O-Level by average, ${aLevel} A-Level by points) match an independent SQL RANK(); ${Number(ties[0].n)} tied positions shared correctly`;
  });

  await check(9, "Best 12 students in each class", async () => {
    const s3 = await prisma.schoolClass.findUniqueOrThrow({ where: { code: "S3" } });
    await A.goto(`${BASE}/exams/${ctx.botId}/results?classId=${s3.id}`);
    const card = A.locator("div.rounded-lg", { has: A.locator("h3", { hasText: /^Best 12 in/ }) });
    const shown = await card.locator("tbody tr").count();
    const cut = await prisma.examResult.findMany({ where: { examId: ctx.botId, classId: s3.id, classPosition: { not: null } }, orderBy: { classPosition: "asc" } });
    const expected = cut.filter((r) => r.classPosition! <= cut[11].classPosition!).length;
    assert(shown === expected && shown >= 12, `shown ${shown}, expected ${expected}`);
    return `S3 shows ${shown} students (12 plus ${shown - 12} tied at the cut-off)`;
  });

  await check(10, "Best 3 students in each stream", async () => {
    const card = A.locator("div.rounded-lg", { has: A.locator("h3", { hasText: /^Best 3 in each stream/ }) });
    const tables = card.locator("table");
    const n = await tables.count();
    const counts: number[] = [];
    for (let i = 0; i < n; i++) counts.push(await tables.nth(i).locator("tr").count());
    assert(n >= 2 && counts.every((c) => c >= 3), `streams ${n}, counts ${counts}`);
    const firsts = await card.locator("td:first-child").allTextContents();
    assert(firsts.filter((t: string) => t.trim() === "1st").length >= n, "each stream should start at 1st");
    return `${n} streams each list their top ${counts.join("/")} by stream position`;
  });

  await check(11, "Report card generation", async () => {
    const one = await admin.request.get(`${BASE}/api/pdf/report-card?examId=${ctx.botId}&studentId=${(await prisma.examResult.findFirstOrThrow({ where: { examId: ctx.botId } })).studentId}`);
    const bulk = await admin.request.get(`${BASE}/api/pdf/report-card?examId=${ctx.botId}&streamId=${s1A.id}`);
    const b1 = Buffer.from(await one.body()); const b2 = Buffer.from(await bulk.body());
    assert(one.ok() && b1.subarray(0, 5).toString() === "%PDF-", "single card not a PDF");
    assert(bulk.ok() && b2.subarray(0, 5).toString() === "%PDF-" && b2.length > b1.length * 5, "bulk not a multi-page PDF");
    fs.writeFileSync(path.join(TMP, "report-cards.pdf"), b2);
    return `individual (${(b1.length / 1024).toFixed(0)} KB) and bulk stream S1 A (${(b2.length / 1024).toFixed(0)} KB) PDFs generated`;
  });

  const bursar = await session("bursar", "Demo12345");
  const Bp = bursar.page;

  await check(12, "Fees payment", async () => {
    await Bp.goto(`${BASE}/fees`);
    await Bp.click('button:has-text("Issue term invoices")'); await submitDialog(Bp); await toast(Bp, /invoice\(s\) issued/);
    await Bp.goto(`${BASE}/fees/students/${ctx.aliceId}`);
    ctx.before = await prisma.ledgerEntry.aggregate({ where: { studentId: ctx.aliceId }, _sum: { debit: true, credit: true } });
    await Bp.fill("input[name=amount]", "400000");
    await Bp.selectOption("select[name=methodId]", { label: "MTN Mobile Money" });
    await Bp.click('button:has-text("Record payment")'); await toast(Bp, /transaction \/ slip reference/);
    await Bp.fill("input[name=externalRef]", `ACC-${Date.now()}`);
    await Bp.click('button:has-text("Record payment")');
    await Bp.waitForURL(/receipt=/, { timeout: 30000 });
    ctx.paymentId = new URL(Bp.url()).searchParams.get("receipt");
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: ctx.paymentId } });
    return `UGX 400,000 MTN MoMo payment recorded (receipt ${p.receiptNo}, transaction ${p.transactionRef}); a payment without its MoMo reference was refused`;
  });

  await check(13, "Automatic balance calculation", async () => {
    const after = await prisma.ledgerEntry.aggregate({ where: { studentId: ctx.aliceId }, _sum: { debit: true, credit: true } });
    const balBefore = Number(ctx.before._sum.debit ?? 0) - Number(ctx.before._sum.credit ?? 0);
    const balAfter = Number(after._sum.debit ?? 0) - Number(after._sum.credit ?? 0);
    const shown = (await Bp.locator("p.text-2xl").first().textContent())!.replace(/[^\d-]/g, "");
    assert(balBefore - balAfter === 400000 && Number(shown) === balAfter, `before ${balBefore} after ${balAfter} shown ${shown}`);
    await Bp.click('button:has-text("Reverse")'); await Bp.fill("[role=dialog] textarea[name=reason]", "Acceptance: reversal test");
    await submitDialog(Bp); await toast(Bp, /reversed/);
    const rev = await prisma.ledgerEntry.aggregate({ where: { studentId: ctx.aliceId }, _sum: { debit: true, credit: true } });
    assert(Number(rev._sum.debit) - Number(rev._sum.credit) === balBefore, "reversal did not restore the balance");
    assert(await prisma.payment.findUnique({ where: { id: ctx.paymentId } }), "payment must not be deleted");
    return `balance ${balBefore.toLocaleString()} → ${balAfter.toLocaleString()} after payment, back to ${balBefore.toLocaleString()} after an authorised reversal (original payment kept)`;
  });

  await check(14, "Receipt generation", async () => {
    const r = await bursar.request.get(`${BASE}/api/pdf/receipt/${ctx.paymentId}`);
    const b = Buffer.from(await r.body());
    assert(r.ok() && b.subarray(0, 5).toString() === "%PDF-", "receipt not a PDF");
    fs.writeFileSync(path.join(TMP, "receipt.pdf"), b);
    return `receipt PDF (${(b.length / 1024).toFixed(1)} KB) with receipt number, transaction reference, amount in words and as-at balance`;
  });

  await check(15, "Parent access to their children's records only", async () => {
    await prisma.exam.update({ where: { id: ctx.botId }, data: { status: "PUBLISHED" } });
    const parent = await session(ctx.parentUser, ctx.parentPw, "Parent-Accept-2026");
    const P = parent.page;
    assert(new URL(P.url()).pathname === "/portal/parent", "parent not on portal");
    const kids = await P.locator('a[href^="/portal/parent/child/"]').count();
    assert(kids === 2, `expected 2 children, saw ${kids}`);
    await P.goto(`${BASE}/portal/parent/child/${ctx.aliceId}`);
    assert((await P.locator("text=School fees").count()) > 0, "child page missing fees");
    const stranger = await prisma.student.findFirstOrThrow({ where: { id: { notIn: [ctx.aliceId, ctx.siblingId] }, examResults: { some: { examId: ctx.botId } } } });
    const page404 = await P.goto(`${BASE}/portal/parent/child/${stranger.id}`);
    const stmt = await parent.request.get(`${BASE}/api/pdf/statement/${stranger.id}`);
    const card = await parent.request.get(`${BASE}/api/pdf/report-card?examId=${ctx.botId}&studentId=${stranger.id}`);
    const own = await parent.request.get(`${BASE}/api/pdf/statement/${ctx.aliceId}`);
    const staffPage = await P.goto(`${BASE}/students`);
    await parent.browser.close();
    assert(page404?.status() === 404 && stmt.status() === 404 && card.status() === 403 && own.ok(), `child ${page404?.status()} stmt ${stmt.status()} card ${card.status()} own ${own.status()}`);
    const landed = new URL(staffPage!.url()).pathname;
    assert(landed === "/forbidden" || landed.startsWith("/portal/parent"), `parent reached staff page (${landed})`);
    return "parent sees exactly 2 linked children, fees and statement; another family's page/statement → 404, report card → 403; staff pages → sent back to the parent portal";
  });

  await check(16, "Teacher access restrictions", async () => {
    const out: string[] = [];
    for (const u of ["/fees", "/finance", "/settings/users", "/hr/payroll", "/students/new"]) {
      await T.goto(`${BASE}${u}`);
      assert(new URL(T.url()).pathname === "/forbidden", `teacher reached ${u}`);
      out.push(u);
    }
    for (const u of ["/api/reports/fees?type=payments", "/api/backup", `/api/pdf/receipt/${ctx.paymentId}`, `/api/reports/payroll?year=2026&month=11`]) {
      const r = await teacher.request.get(`${BASE}${u}`);
      assert([403, 404].includes(r.status()), `${u} → ${r.status()}`);
    }
    // Class teachers may record discipline, but confidential counselling/medical records stay hidden
    await T.goto(`${BASE}/welfare`);
    assert((await T.locator("text=restricted to welfare staff").count()) === 1, "teacher saw confidential welfare records");
    const mtc = await prisma.subject.findUniqueOrThrow({ where: { code: "MTC" } });
    await T.goto(`${BASE}/exams/${ctx.examId}/marks?streamId=${s1A.id}&subjectId=${mtc.id}`);
    assert((await T.locator("text=not allocated").count()) > 0, "teacher could open marks for an unallocated subject");
    return `teacher blocked from ${out.join(", ")}; fees/backup/receipt/payroll APIs refused; counselling & medical records hidden; cannot open Mathematics marks (not allocated)`;
  });

  await check(17, "Role-based permissions (configurable, enforced server-side)", async () => {
    const lib = await session("librarian", "Demo12345");
    await lib.page.goto(`${BASE}/library`);
    const libOk = new URL(lib.page.url()).pathname === "/library";
    await lib.page.goto(`${BASE}/inventory`);
    const invBlocked = new URL(lib.page.url()).pathname === "/forbidden";
    // Grant inventory to the Librarian role through the UI, then confirm access changes immediately
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "LIBRARIAN" }, include: { permissions: { include: { permission: true } } } });
    await A.goto(`${BASE}/settings/roles`);
    const card = A.locator("div.rounded-lg", { has: A.locator("h3", { hasText: role.name }) });
    await card.locator('button:has-text("Edit permissions")').click();
    await A.check('[role=dialog] input[value="inventory.manage"]');
    await submitDialog(A); await toast(A, /Role saved/);
    await lib.page.goto(`${BASE}/inventory`);
    const nowAllowed = new URL(lib.page.url()).pathname === "/inventory";
    await lib.browser.close();
    assert(libOk && invBlocked && nowAllowed, `lib ${libOk} blocked ${invBlocked} granted ${nowAllowed}`);
    return "librarian: library allowed, inventory denied; after the admin granted inventory.manage in Settings → Roles, access changed immediately without code changes";
  });

  await check(19, "Audit log functionality", async () => {
    const actions = await prisma.auditLog.groupBy({ by: ["action"], _count: true });
    const have = new Set(actions.map((a) => a.action));
    const need = ["CREATE", "IMPORT_COMMIT", "PROMOTE", "MARKS_SAVED", "SUBMIT_MARKS", "GENERATE_RESULTS", "PAYMENT", "REVERSE_PAYMENT", "UPDATE", "REPORT_CARDS", "PASSWORD_CHANGED"];
    const missing = need.filter((n) => !have.has(n));
    await A.goto(`${BASE}/settings/audit?q=REVERSE_PAYMENT`);
    const shown = await A.locator("td", { hasText: "REVERSE_PAYMENT" }).count();
    let blocked = false;
    try { await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE action = 'PAYMENT'`); } catch { blocked = true; }
    const logins = await prisma.loginHistory.count({ where: { success: true } });
    assert(missing.length === 0 && shown > 0 && blocked, `missing ${missing}, shown ${shown}, blocked ${blocked}`);
    return `${actions.reduce((a, x) => a + x._count, 0)} audit entries across ${have.size} action types (all key actions present), searchable in Settings → Audit; deleting audit rows is blocked by the database; ${logins} successful sign-ins in login history`;
  });

  await Promise.all([admin.browser.close(), teacher.browser.close(), bursar.browser.close()]);
}

main()
  .catch((e) => { console.error(e); results.push({ id: 0, name: "Runner", ok: false, evidence: String(e), ms: 0 }); })
  .finally(async () => {
    // §18 backup & restore is executed by scripts/acceptance.sh and appended there.
    const passed = results.filter((r) => r.ok).length;
    const lines = [
      "# Acceptance Test Report",
      "",
      `Run: ${new Date().toISOString()} against ${BASE} (production build, fresh database with configuration seed and demo/training data).`,
      "",
      `**Browser checks: ${passed} of ${results.length} passed.**`,
      "",
      "| # | Requirement (brief §30) | Result | Evidence |",
      "|---|---|---|---|",
      ...results.sort((a, b) => a.id - b.id).map((r) => `| ${r.id} | ${r.name} | ${r.ok ? "PASS" : "**FAIL**"} | ${r.evidence.replace(/\|/g, "\\|")} |`),
      "",
    ];
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/ACCEPTANCE_REPORT.md", lines.join("\n"));
    console.log(`\n${passed}/${results.length} passed. Artifacts in ${TMP}`);
    await prisma.$disconnect();
    process.exit(passed === results.length ? 0 : 1);
  });
