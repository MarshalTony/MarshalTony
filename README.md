# Bishop Ogez High School — School Management Information System (SMIS)

Cloud web application for academic, administrative and financial operations at Bishop Ogez High School, Uganda.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · PostgreSQL 16 · Prisma 6 · Zod · ExcelJS · React-PDF · Recharts

## Status
Work in progress (Phase 1: foundation). See `docs/` as it is added.

## Local development
```bash
cp .env.example .env        # set DATABASE_URL, SESSION_SECRET
npm install
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='choose-one' npm run db:seed
npm run dev
```
Sign in as `admin`; you will be asked to change the password.

## Tests
```bash
npm test
```
