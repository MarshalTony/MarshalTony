# Bishop Ogez High School SMIS — development state & working notes

Loaded automatically into every Claude Code session (and kept across context compaction).
**Keep it current:** after each feature, update "Feature inventory", "Live data state" and "Pending"
in the same commit. No secrets here (no passwords, keys or connection strings).

_Last updated: 2026-11-20 — competency card for all S1–S4 exams._

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
- Checks before every commit: `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (86 tests at last count:
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
`leaving_clearance` (StudentClearance, LeavingRecord), `comment_bank` (CommentTemplate).

## 6. Decisions agreed with the school (do not undo without asking)

- **Every S1–S4 report card (BOT, MOT, EOT…) = the school's two-page competency (CBC) card** (`src/server/reports/report-card-cbc.tsx`):
  page 1 Activities of Integration (chapters scored **out of 3**, average, identifier 3/2/1, descriptor, remark, teacher);
  page 2 "Summary of <exam type> Performance": **out of 20** (= avg ÷ 3 × 20) + **the exam out of 80** (column "BOT/80", "EOT/80"…; papers out of 100 are scaled) = total, grade **A 90–100, B 80–89, C 60–79, D 50–59, E 0–49**
  with the long descriptors, class-teacher & head-teacher comments, term dates, red "invalid without school stamp".
  Switchable in Settings → School profile (`reportTemplate.cbcOLevel`). Only A-Level (S5–S6) uses the standard one-page card.
- **S5–S6 (A-Level) have no Activities of Integration**; their papers are out of 100. New exams ask for an O-Level max (80 for EOT) and an A-Level max (100).
- **No DOS approval of marks** (Settings switch `reportTemplate.requireMarksApproval`, default off): saved marks count at once.
- **Examinations are always open for marks entry** — no open/close; only Publish/Unpublish (visibility to parents/students). New exams start `OPEN`.
- Printing report cards refreshes results automatically when marks changed (`ensureFreshResults`).
- **Teachers only see/enter their allocated subjects & streams**; the admin/DOS picks the **teacher first** (Teacher → Class → Subject → Term → Year) so the right subject teacher prints on the card.
- **Averages for analysis and comments = average across ALL subjects** as printed on the card (`src/server/exams/report-scores.ts`: CBC subject totals for every O-Level exam, subject % for A-Level).
- Report Cards page: Year → Term → Report (exam) → Class → Stream → Generate; or One student (search). Classes not in the exam are shown as such (fix by **Edit** on the exam).
- Exams can be **edited** (name, type, term, dates, classes) and **deleted** (exams with marks need the name typed).

## 7. Feature inventory (where things live)

- **Students:** list with smart search/filters (`src/server/queries/students.ts`, `components/student-filters.tsx`), profile, register/edit/delete,
  **Bulk edit** (`students/bulk`), **Photos** (`students/photos`, upload many by admission number), **Print list** PDFs (nominal roll,
  attendance, mark sheet, parents' contacts, photo register — `api/pdf/class-list`), **Leaving & clearance** (`students/[id]/leaving`,
  class board `students/clearance`, PDFs `api/pdf/leaving/[id]`: clearance form, leaving certificate/testimonial, transfer, recommendation),
  promotion, transfer stream, ID cards, admission form, imports.
- **Academics:** subjects & combinations, **Allocation grid** (`academics/grid`), allocations list, timetables, **Enter Scores**
  (`/scores`: Activity scores out of 3 for S1–S4; Exam scores for any exam of the term), **Comment Bank** (`/comment-bank`),
  Examinations (create/edit/delete, results, broadsheets, **Analysis** `exams/[id]/analysis` + PDF `api/reports/analysis`:
  winner, best/weakest subject, best stream, best 10/last 10 class, best 10/last 3 per stream, subject×stream with teachers,
  teacher averages, improvement vs comparison exam, at-risk), comments page `exams/[id]/comments` (fill from bank, ↻),
  **Report Cards** (`/report-cards`), UNEB, attendance, assignments.
- **Fees & finance, HR/payroll, library, inventory, welfare/discipline, transport, communication, reports, settings, audit, backup, portals** — from phases 4–6 (see docs).

## 8. Live data state (2026-11-20)

- Exams: one — **"Begining of Term 3 exam"** (BOT, S1–S6, out of 100, open, 0 marks). The earlier EOT exam was deleted by the school.
- Only **7 of 75** teaching staff have allocations for 2026 → teachers need allocating (Allocation grid) before they can enter scores.
- Headteacher name not set (letters print "HEADTEACHER") — Settings → School profile.
- Comment bank seeded (10 class-teacher, 10 head-teacher, 5 DOS comments). No live test data was created by Claude.

## 9. Pending / next ideas (not started unless the owner asks)

- Termly report combining BOT + MOT + EOT on one card (if wanted).
- Report-card subject order (custom order instead of alphabetical); confirm admission-number / "Reg Number" format.
- Other modules the owner may pick next: fees, attendance, parent portal, SMS (needs Africa's Talking keys), enrolment statistics (EMIS),
  student documents, siblings/family view, data clean-up assistant.
