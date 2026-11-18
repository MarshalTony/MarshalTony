# Bishop Ogez High School — School Management Information System (SMIS)

A cloud web application for the academic, administrative and financial work of **Bishop Ogez High School, Uganda** (O-Level S1–S4, A-Level S5–S6). It works on phones, tablets and computers, and supports many users at once with role-based access.

**Stack:** Next.js 15 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS (shadcn-style components) · PostgreSQL 16 · Prisma 6 · Zod · ExcelJS · React-PDF · Recharts · Vitest · Playwright.

## What it does

| Area | Highlights |
|---|---|
| Students & parents | Registration (auto admission numbers), Excel import with preview, profiles with photo, guardians (one parent ↔ many children), portal accounts, stream transfers, withdrawals, end-of-year promotion with full class history, admission forms, ID cards |
| Academics | Years/terms, classes/streams, subjects, A-Level combinations, teacher allocations, timetables (no double-booking), calendar |
| Examinations | BOT/MOT/EOT/Mock/custom exams, marks entry (ABS/EX) and Excel import, submit → approve/return, audited corrections, **configurable grading scales, points, divisions, ranking basis, tie rules**, combined exams with weighted formulas, class/stream/subject positions, best 12 per class & best 3 per stream, subject analysis, broadsheets, **PDF report cards** (single and bulk, configurable) |
| Fees | Structures by class and day/boarding, term billing, payments (cash, bank, MTN/Airtel MoMo, cheque) with unique receipt and transaction numbers, reversals and adjustments (no edits/deletes), scholarships/bursaries, statements, receipts, daily/term/outstanding/class reports, SMS reminders |
| Accounts | Payment vouchers with approval, other income, suppliers, purchase orders, petty cash, budgets vs actual, income & expenditure, cash flow |
| HR | Staff records (confidential fields restricted), qualifications, leave, salary advances, payroll (Uganda PAYE & NSSF), appraisals, staff attendance |
| Operations | Student attendance, library (loans, fines), inventory & assets (reorder alerts), discipline, counselling & sick bay (confidential), transport, UNEB candidate registers |
| Communication | Announcements, SMS / email / WhatsApp with delivery status, message templates, assignments & learning materials |
| Portals | Parent portal (all children: results, report cards, fees, receipts, statements, attendance, timetable, notices) and student portal |
| Administration | Role dashboards with charts, reports in PDF/Excel/CSV, settings without code changes, roles & permissions editor, audit log, login history, data export |

## Quick start (development)

Requirements: Node.js 22, PostgreSQL 16.

```bash
cp .env.example .env            # set DATABASE_URL
npm install
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='choose-a-password' npm run db:seed
npm run db:demo                  # optional: fictitious training data (local databases only)
npm run dev                      # http://localhost:3000 — sign in as "admin"
```

Demo/training logins created by `db:demo` (password `Demo12345`): `head`, `deputy`, `dos`, `bursar`, `registrar`, `librarian`, `teacher1`…`teacher13`, `parent1`, `student1`. **Never load demo data into production.**

## Tests

```bash
npm test                         # 51 unit + database integration tests (uses a database whose name contains "test")
npm run lint && npm run typecheck
bash scripts/acceptance.sh       # full acceptance run: new DB + production build + browser + backup/restore
```

Latest acceptance result: **19 of 19 requirements passed** — see [docs/ACCEPTANCE_REPORT.md](docs/ACCEPTANCE_REPORT.md).

## Documentation

| Document | For |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, ERD, folder structure, roadmap |
| [Deployment](docs/DEPLOYMENT.md) | Vercel + managed PostgreSQL + R2, environments, domain, migrations, monitoring |
| [External services & costs](docs/EXTERNAL_SERVICES.md) | Accounts, credentials and running costs |
| [Backup & recovery](docs/BACKUP_AND_RECOVERY.md) | Backup layers, restore procedure, routine |
| [Security & data protection](docs/SECURITY.md) | Controls and Uganda Data Protection and Privacy Act obligations |
| [Administrator manual](docs/ADMIN_MANUAL.md) | Setup checklist, termly cycle, end of year |
| [User manual](docs/USER_MANUAL.md) | Teachers, class teachers, DOS, bursar, registrar, parents, students |
| [API reference](docs/API.md) | Server actions and download routes with their permissions |

## Project status

All seven development phases are implemented and verified locally (production build, 51 automated tests, 19/19 acceptance checks including backup and restore). **Not yet done:** production deployment (needs the school's Vercel, database, storage and DNS accounts), messaging provider credentials (SMS/email/WhatsApp currently record messages as *not configured*), and the school's confirmation of grading rules and term dates. There is no official UNEB integration.

School contacts: www.bishopogez.com · ogezhigh@gmail.com · +256 772 314 931
