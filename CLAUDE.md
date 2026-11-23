# Bishop Ogez High School SMIS — development state & working notes

Loaded automatically into every Claude Code session (and kept across context compaction).
**Keep it current:** after each feature, update "Feature inventory", "Live data state" and "Pending"
in the same commit. No secrets here (no passwords, keys or connection strings).

_Last updated: 2026-11-23 — printed score sheet per class / stream._

## 1. What this is

School Management Information System for **Bishop Ogez High School, Bushenyi, Uganda** (O-Level S1–S4,
A-Level S5–S6). Built from the "master development prompt" (phases 1–7 all delivered), then extended
feature by feature with the school's owner (GitHub `MarshalTony`), who talks in short, informal
messages — confirm the intent, build, test, deploy, then report in plain language.

- Repo: `MarshalTony/MarshalTony` (local clone `/home/user/marshaltony`). Work on **`main`**; also push
  `main` → `claude/smis-foundation` (mirror). Default branch should be `main` (owner sets it in GitHub).
- Live: https://bishop-ogez-smis.vercel.app (Vercel project `bishop-ogez-smis`, id `prj_d5aBe0qDeHTHHc1QpEQVGH8BjAbQ`,
  team `team_EBuaZefLUMolycAayduPqUQO`, region fra1, **Hobby plan**).
- Database: Supabase project `bishop-ogez-smis` (ref `nvcnakuigxznmenqrpen`, eu-central-1), Postgres
  schema **`smis`**, app role `smis_app`. Use the Supabase MCP (`execute_sql`, project_id above) for
  read-only checks; never write production data except through the app.

## 2. Stack & architecture

Next.js 15.5 App Router + React 19 + TypeScript, Tailwind 3 (shadcn-style components in `src/components/ui`),
Prisma 6.19 + PostgreSQL, Zod, ExcelJS, @react-pdf/renderer (PDFs), Recharts, sharp (photo shrinking in PDFs).
See `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/API.md`.

- Pages: `src/app/(app)/**` (staff), portals under `/portal`. API routes: `src/app/api/**`
  (PDFs in `api/pdf/*`, reports in `api/reports/*`, exports, templates, files, `api/students/lookup`).
- Server actions: `src/server/actions/*.ts` via the `action()` wrapper in `src/server/action.ts`
  (auth + permission + Zod + error mapping + `revalidate` + `serverRedirect`).
- Domain logic: `src/server/**` (server-only), pure helpers in `src/lib/**` (unit-tested).
- Auth: DB-hashed session tokens; RBAC permission catalogue `src/lib/permissions.ts` (roles editable in DB).
- Fees ledger is **append-only** with 7 DB immutability triggers — never edit/delete financial rows; correct by reversal/adjustment.
- Files: storage drivers `database` (default on Vercel, `StoredFile.data`), `s3`, `local`. Images resized in the browser (`src/lib/resize-image.ts`; photos ≤800px JPEG, logo 512px PNG).
- Audit everything that changes data (`src/server/audit.ts`).

## 3. Conventions & gotchas (learned the hard way)

- **"use server" files may only export async actions, and must contain no inline callbacks in top-level
  arguments** (e.g. `z.enum(LIST.map((x) => …))` breaks the build: "Server Actions must be async functions").
  Put such arrays/callbacks in a non-server module (e.g. `src/server/leaving.ts`, `src/server/schemas.ts`). A test enforces exports.
- **Multi-value form fields must be named with `[]`** (`classIds[]`) — `formToObject` only makes arrays for `name[]`.
- Imports: `src/server/imports/kinds.ts` (ImportKind: columns or `columnsFor(ctx)`, templateRows, check, commit); always use `columnsOf(def, ctx)`
  for templates, reading uploads, previews and error reports. Shared activity access rule: `src/server/activities-access.ts`.
- Excel sheet names: no `* ? : \ / [ ]`, max 31 chars — sanitised in `reports/table.tsx` and `imports/excel.ts`.
- Large client payloads: send JSON in one hidden field (`payload`/`rows`) and parse with Zod in the action (bulk edit, allocation grid).
- After `prisma migrate dev` the running dev server keeps the old Prisma client → **restart `next dev`** (errors like "Unknown field … for include").
- react-pdf: fonts need `outputFileTracingIncludes` (in `next.config.ts`); hyphenation disabled in `pdf-kit.tsx`;
  use exact point widths with `flexShrink: 0` for table columns (percentages misalign); repeat headers with `fixed`.
- Vercel limits: response body ~4.5 MB (photos in multi-student PDFs are shrunk via `photoBuffers(ids, { maxPx })`), function 60 s.
- Never commit secrets; `.env` is local only. Commit messages end with the attribution lines supplied by the session.
- Pronouns in user-facing chat: they/them. Letters to schools use the student's recorded sex (he/she) — that is document content, fine.

## 4. Local development & verification

- Postgres stops between sessions: `service postgresql start`. Dev DB `smis_dev` (see `.env`), test DB `smis_test`
  (tests refuse any DB whose name lacks "test"; `tests/global-setup.ts` migrates + seeds it).
- Dev server: `npx next dev -p 3000`. Demo data: `npm run db:demo` (demo users and their password are in `prisma/demo-data.ts`;
  `teacher1` = Okello Peter, class teacher of S1 A, English everywhere; also `bursar`, `librarian`).
  Local admin password can be reset with a bcrypt update in a scratch script (never commit it).
- Checks before every commit: `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (129 tests at last count:
  unit in `tests/unit`, DB integration in `tests/integration`). Acceptance suite: `npm run test:acceptance`.
- Browser verification with Playwright (pre-installed; `require('playwright')`), scripts kept in the scratchpad
  (they are not in the repo). Log in, drive the page, save PDFs and render them with `pdftoppm`/`pdftotext` to check.
  Restore any local data you change for a test. Do not claim success without running it.
- Safety: database deletes driven by shell variables get blocked — delete test data through the app's own Delete or with literal ids.

## 5. Deployment

Push to `main` → Vercel builds automatically (Hobby: builds queue; ~5–8 min). Build = `npm run vercel-build` =
`prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build` (seed is idempotent and only fills gaps).
Verify with `mcp__Vercel__list_deployments` (state READY) and, for migrations, `select migration_name from smis._prisma_migrations`.
Runtime logs are kept 1 hour. Env vars on Vercel: `DATABASE_URL` (transaction pooler :6543 with `pgbouncer=true&connection_limit=1&schema=smis`),
`DIRECT_URL` (session pooler :5432), `SEED_ADMIN_PASSWORD`, `STORAGE_DRIVER=database`, `APP_URL`; SMS/email/WhatsApp keys not yet set (messages log as NOT CONFIGURED).

Migrations (all additive after init): `init`, `financial_immutability`, `subject_result_status`, `stored_file_data`,
`continuous_assessment` (LearningActivity, ActivityScore, CompetencyRemark, SchoolPay code, altEmail, band descriptions),
`leaving_clearance` (StudentClearance, LeavingRecord), `comment_bank` (CommentTemplate), `subject_report_order` (Subject.reportOrder, default 100),
`subject_papers` (Subject.paperCount — sets A-Level subjects except GP/S-MTC to 2; Mark.paper + new unique key),
`clubs_houses_confirmation` (House, Club, ClubMember, StudentConfirmation; Student.houseId), `class_subjects` (ClassSubject + enum ClassSubjectStatus), `combination_category` (enum CombinationCategory; SubjectCombination.category, Stream.combinationCategory, with defaults).

## 6. Decisions agreed with the school (do not undo without asking)

- **Every S1–S4 report card (BOT, MOT, EOT…) = the school's two-page competency (CBC) card** (`src/server/reports/report-card-cbc.tsx`):
  page 1 Activities of Integration (chapters scored **out of 3**, average, identifier 3/2/1, descriptor, remark, teacher);
  page 2 "Summary of <exam type> Performance": **out of 20** (= avg ÷ 3 × 20) + **the exam out of 80** (column "BOT/80", "EOT/80"…; papers out of 100 are scaled) = total, grade **A 90–100, B 80–89, C 60–79, D 50–59, E 0–49**
  with the long descriptors, class-teacher & head-teacher comments, term dates, red "invalid without school stamp".
  Switchable in Settings → School profile (`reportTemplate.cbcOLevel`). A-Level (S5–S6) uses the school's A-Level paper format (below).
- **S5–S6 subjects: at most 3 principal subjects + 2 subsidiaries = General Paper + EITHER Sub-Maths OR Sub-ICT** (never both).
  Rule `src/lib/alevel.ts` (`aLevelProblems`), enforced in combinations (must be complete: 3P + GP + 1), profile subjects, bulk edit;
  violations listed on Students → Data check.
- **S5–S6 (A-Level) have no Activities of Integration**; their papers are out of 100. New exams ask for an O-Level max (80 for EOT) and an A-Level max (100).
- **A-Level papers:** every A-Level subject has **2 papers** (P/1, P/2; Sub-ICT S/1, S/2) except **General Paper and Sub-Maths (1 paper, S/1)** — `Subject.paperCount`, `Mark.paper` (unique exam×student×subject×paper). Marks entered per paper (tabs on the marks sheet, `?paper=`; Excel template per paper).
  Results combine papers (mean; missing/ABS paper = 0 once another has a mark; `combinePapers`) and A-Level subject grade/points come from paper grades (`src/lib/uace.ts`, engine `override`).
- **S5–S6 report card = the school's A-Level format** (`src/server/reports/report-card-alevel.tsx`, from the owner's schoolmonitorug sample): per paper a column for every exam of the term up to the printed one (B.O.T, E.O.T…),
  AVERAGE (missing exam = 0, rounded half up), PAPER GRADE D1–F9 (bands: scale appliesTo `PAPER`), GRADE A–F, COMMENT (paper band remark), INITIAL (subject teacher), TOTAL POINTS, grading scale, points key, comments, dates, crest watermark.
  Rules adopted (DOS to confirm): principal = worst paper (≤D2 A6, C3 B5, C4 C4, C5 D3, C6 E2, P7–P8 O1, F9 F0); subsidiary O1 if every paper ≤C6 else F0.
  The card grades the **term average**; exam results/rankings grade that exam alone. Switch `reportTemplate.aLevelPapers` (default on).
- **No DOS approval of marks** (Settings switch `reportTemplate.requireMarksApproval`, default off): saved marks count at once.
- **Examinations are always open for marks entry** — no open/close; only Publish/Unpublish (visibility to parents/students). New exams start `OPEN`.
- Printing report cards refreshes results automatically when marks changed (`ensureFreshResults`).
- **Teachers only see/enter their allocated subjects & streams**; the admin/DOS picks the **teacher first** (Teacher → Class → Subject → Term → Year) so the right subject teacher prints on the card.
- **Averages for analysis and comments = average across ALL subjects** as printed on the card (`src/server/exams/report-scores.ts`: CBC subject totals for every O-Level exam, subject % for A-Level).
- Report Cards page: Year → Term → Report (exam) → Class → Stream → Generate; or One student (search). Classes not in the exam are shown as such (fix by **Edit** on the exam).
- Exams can be **edited** (name, type, term, dates, classes) and **deleted** (exams with marks need the name typed).
- **Current year/term switcher** (Settings → Years & terms; header badge from `app/(app)/layout.tsx` → `AppShell period`): `PeriodSwitcher` (year → term) calls `setCurrentTerm`; per-year readiness (terms, enrolled, subjects, allocations, fees, exams + warnings); `createAcademicYearWithTerms` (3 terms, dates from `src/lib/academic-year.ts`, optional allocation copy, fills previous last term's nextTermStart), `copyTeacherAllocations`, `deleteAcademicYear` (only if unused). New-year order: create → promote (old year current) → allocations/fees → switch.
- **Subjects by class (O-Level)** (Classes & Subjects → Subjects by class, `academics/classes`): `ClassSubject` (class × subject → COMPULSORY | OPTIONAL | NOT_OFFERED; no row = subject category). `defaultSubjectIds` (registration, quick reg, import, promotion, Data-check fix) gives the class's compulsory subjects; Bulk edit columns = optional in the class; profile picker hides not-offered; `setStudentSubjects` refuses adding not-offered. `applyClassSubjectRules` adds missing compulsory + removes not-offered without marks (optional untouched). Helpers `src/lib/class-subjects.ts`, `src/server/class-subjects.ts`.
- **A-Level stream follows the combination's category:** `SubjectCombination.category` (ARTS | SCIENCES; migration defaulted: Physics/Chemistry/Biology/Agriculture principal = Sciences, else Arts — so MEG = Arts) and `Stream.combinationCategory` (Settings → Classes & streams; else inferred from the name ARTS / SCIEN…; live S5 = ARTS, SCIENCE; S6 = A, B need setting). Placement `pickStream` (`src/lib/combination-stream.ts`), `streamForCombination` / `moveToStream` (`src/server/combination-stream.ts`, keeps enrolment, audits TRANSFER_STREAM) in register, quick reg, import, Bulk edit (client moves the stream select too), profile Change subjects, promotion S5→S6; Classes & Subjects shows misplaced count + *Move them to the right stream* (`placeStudentsByCombination`).
- **Exam subjects follow the students:** `syncExamSubjects` (`src/server/exams/exam-subjects.ts`) adds every subject active students of an exam class take (usual max per level; never removes) —
  run on the exam page, marks sheet, readiness and results generation. (Bug 2026-11-20: exam created before S2/S3/S5 were imported had no subjects for them.)

## 7. Feature inventory (where things live)

- **Students:** list with smart search/filters (`src/server/queries/students.ts`, `components/student-filters.tsx`), profile (with **Results history**: chart, card averages/grades/change/positions, subject-by-subject — `components/results-history.tsx`), register/edit/delete,
  **Bulk edit** (`students/bulk`), **Photos** (`students/photos`, upload many by admission number), **Print list** PDFs (nominal roll,
  attendance, mark sheet, parents' contacts, photo register — `api/pdf/class-list`), **Leaving & clearance** (`students/[id]/leaving`,
  class board `students/clearance`, PDFs `api/pdf/leaving/[id]`: clearance form, leaving certificate/testimonial, transfer, recommendation),
  promotion, transfer stream, ID cards, admission form, imports, **Statistics** (`students/statistics` + `api/reports/enrolment`:
  by class/stream, age × class × sex (EMIS, age on 1 Jan), day/boarding, admissions, leavers; logic `src/server/enrolment.ts`), **Data check** (`students/data-check`: no subjects / no enrolment
  with one-click fixes, A-Level without combination, likely duplicates, no parent, non-Ugandan phones, missing LIN/photo/DOB/SchoolPay; helpers `src/lib/data-check.ts`),
  **Clubs & Houses** (`students/groups`, detail `students/groups/[kind]/[id]`, actions `server/actions/groups.ts`, balanced share-out `src/lib/houses.ts`, member list `api/reports/group`; house on forms/Bulk edit/profile/export; filters `house`, `club` incl. `none`),
  **Quick registration** (`students/quick`, grid `components/quick-register-grid.tsx` with Excel paste, rules `src/lib/quick-register.ts`, action `server/actions/quick-register.ts`; all-or-nothing, duplicate-name guard),
  **Print full profile** (button on the profile → `api/pdf/student-profile/[id]`, `server/reports/student-profile.tsx`; fees/discipline/medical sections follow `fees.view`/`discipline.manage`/`welfare.confidential`; audited PRINT_PROFILE),
  **Confirm students** (`students/confirm`, per term `StudentConfirmation`, actions `server/actions/confirmation.ts`; filter `reported=yes|no` = current term; profile line). Shared tick list `components/member-picker.tsx`.
- **Academics:** subjects & combinations, **Report order** (`academics/order`, `Subject.reportOrder`; used by both report cards and the broadsheet), **Allocation grid** (`academics/grid`), allocations list, timetables, **Enter Scores**
  (`/scores`: Activity scores out of 3 for S1–S4 — typed or **Excel** (pre-filled template, one column per chapter; import kind `activities` with dynamic `columnsFor`); Exam scores for any exam of the term), **Comment Bank** (`/comment-bank`),
  Examinations (create/edit/delete, results, broadsheets, **Analysis** `exams/[id]/analysis` + PDF `api/reports/analysis`:
  winner, best/weakest subject, best stream, best 10/last 10 class, best 10/last 3 per stream, subject×stream with teachers,
  teacher averages, improvement vs comparison exam, at-risk), **Readiness** `exams/[id]/readiness` (marks / activity scores / comments
  progress per class × stream × subject, teachers to follow up; logic `src/server/exams/progress.ts` + `src/lib/exams/progress.ts`), comments page `exams/[id]/comments` (fill from bank, ↻),
  **Score sheet** (exam → Results → *Score sheet PDF / Excel / A–Z*; `api/reports/scoresheet`, `src/server/reports/scoresheet.tsx`, helpers `src/lib/scoresheet.ts`): class or stream, subject scores as on the report card (S1–S4 CBC total /100 = act/20 + exam/80; A-Level % + grade A–F, points), No., total, average, grade/points, class & stream positions (O-Level by all-subject average with ties; A-Level from results), foot: candidates, mean, highest, lowest, grade counts, teacher initials; A3 when >13 subjects. Old broadsheet kept as *Exam marks only (Excel)*.
  **Report Cards** (`/report-cards`; S1–S4 CBC card, S5–S6 A-Level paper card `report-card-alevel.tsx`), UNEB, attendance, assignments.
- **Staff logins** (`staff/logins`, `users.manage`): per-staff create login with admin-chosen username + password and
  "must change at first sign-in" (default on), bulk create for everyone without one (first.last usernames, one starting password),
  set password / disable. Admin-typed passwords also in Settings → Users (create + Set password). Helpers `src/server/users.ts`.
- **Menus follow permissions** (`src/lib/nav.ts` + `navFor`); every menu item's perms match its page's `requirePage`; Settings redirects
  to the first tab a user may open. Verified per role by opening every visible menu link.
- **Favicon / app icon:** `/api/icon?size=` (school logo via sharp, fallback "BO" badge; `/favicon.ico` rewritten to it in `next.config.ts`; icon tags in `src/app/layout.tsx` metadata).
- **Fees & finance, HR/payroll, library, inventory, welfare/discipline, transport, communication, reports, settings, audit, backup, portals** — from phases 4–6 (see docs).

## 8. Live data state (2026-11-22, after the owner's second bulk delete)

- **2026-11-22: owner found an error in the imported data and asked to delete it** ("Students, parents and exam", backup first).
  Deleted in one SQL transaction (audit log `BULK_DELETE_STUDENTS`): 1,082 students and everything linked (subjects, enrolments,
  results, confirmations…), 876 parents, the exam "Beginning of term 3" (1 mark), the 6 activity chapters of Term 3, and the 10 student import batches.
  **Backup kept inside the database: schema `backup_20261122`** (copies of Student, Guardian, StudentGuardian, StudentSubject, Enrollment,
  Exam*, Mark, results, ActivityScore, LearningActivity, ImportBatch, … taken just before the delete; no API access). Drop it once the owner no longer needs it.
- (Earlier, 2026-11-20: first bulk delete of 1,096 demo-era students and 2 exams, no backup.)
- Kept: 75 staff, 231 teacher allocations (2026), 6 classes, 20 streams, 32 subjects (A-Level paper counts set), comment bank, settings,
  headteacher name, staff logins (only 2 staff have logins), no fees data, no houses/clubs yet.
- Next for the school: re-import the corrected student list, create the exam, create teacher logins, assign class teachers, add activity chapters.

## 9. Pending / next ideas (not started unless the owner asks)

- **Owner's focus (2026-11-22): students, parents, staff and academics** — prioritise these over finance/operations modules.
- **Comparison with schoolmonitorug (owner's screenshots, 2026-11-22; nothing built yet).** Gaps in the focus areas, suggested order:
  1. Next term fees on the report card. 2. ✅ Clubs & Houses (lists + membership) — built 2026-11-22 with ✅ Quick registration and ✅ Confirm students (owner's order: 4, 2, 1). 3. CBC non-academic assessment (projects, games & sports,
  clubs, co-curricular, values exhibited) printed on the card — needs a sample card from the owner. 4. Students: Confirm Students (per term),
  export all photos as zip, quick registration, LIN page. 5. Staff: hours taught (from timetable). 6. Parents: sibling/family view, SMS keys,
  check portal. Lower priority: hostels/dormitories, automatic timetable generator. Still to see: System Reports menu, their parent features.

- **Agreed order (owner said "we go as your order"):** ✅ report readiness tracker → ✅ activity scores from Excel → ✅ subject order on report cards → combined BOT+MOT+EOT card (**only if the owner wants it — ask**) → students: ✅ results history on profile → ✅ data clean-up check → ✅ enrolment statistics (EMIS) → **next: student documents** (needs a migration for document records; files via `saveUpload`).

- Termly report combining BOT + MOT + EOT on one card (if wanted).
- ✅ A-Level report in the school's format (built 2026-11-20). Open: DOS to confirm the UACE grading rules; Sub-ICT assumed 2 papers.
- Confirm admission-number / "Reg Number" format on the card.
- Other modules the owner may pick next: fees, attendance, parent portal, SMS (needs Africa's Talking keys), enrolment statistics (EMIS),
  student documents, siblings/family view, data clean-up assistant.
