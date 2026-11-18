# Deployment guide

Target: **https://smis.bishopogez.com** on Vercel, managed PostgreSQL, Cloudflare R2. Three environments:

| Environment | Branch | Database | URL |
|---|---|---|---|
| Development | any (local) | local PostgreSQL | http://localhost:3000 |
| Staging | `staging` (Vercel *Preview* for that branch) | separate staging DB (e.g. a Neon branch) | `staging-smis.bishopogez.com` or the Vercel preview URL |
| Production | `main` | production DB | `smis.bishopogez.com` |

> Each Vercel environment **must** have its own `DATABASE_URL`. The build runs `prisma migrate deploy`, so a preview build must never point at production.

## 1. Accounts (owned by the school)

Create these with a school-controlled email (e.g. ogezhigh@gmail.com) so the school, not a contractor, owns them: GitHub organisation, Vercel (Pro), Neon or Supabase, Cloudflare (R2 + optionally DNS). See `EXTERNAL_SERVICES.md` for costs.

## 2. Database

1. Create a project in the **Frankfurt / eu-central-1** region (closest supported region to Uganda alongside Vercel `fra1`).
2. Create two databases/branches: `production` and `staging`. Enable point-in-time recovery / daily backups (retain ≥ 7 days; 30 recommended).
3. Two connection strings are needed:
   * `DATABASE_URL` — the **transaction pooler** for the app (serverless). Supabase: port **6543**, add `?pgbouncer=true&connection_limit=1&schema=smis&sslmode=require`.
   * `DIRECT_URL` — the **session/direct** connection for migrations and backups. Supabase: session pooler port **5432**, `?schema=smis&sslmode=require`.
4. **Supabase only:** keep the school tables out of the auto-published `public` schema (Supabase's Data API exposes it with the public anon key). Create a dedicated login and schema once in the SQL editor:
   ```sql
   CREATE ROLE smis_app LOGIN PASSWORD '<strong password>';
   GRANT smis_app TO postgres;
   CREATE SCHEMA smis AUTHORIZATION smis_app;
   REVOKE ALL ON SCHEMA smis FROM PUBLIC;
   ALTER ROLE smis_app SET search_path = smis;
   ```
   and connect as user `smis_app.<project-ref>`.

## 3. File storage

Photos, the logo and attachments are stored according to `STORAGE_DRIVER`:

| Driver | Where | When to use |
|---|---|---|
| `database` (**default on Vercel**) | `StoredFile.data` in PostgreSQL | Pilot and small/medium schools. Private, included in database backups, no extra service. Images are resized in the browser before upload (photos ≤ 800 px ≈ 60–100 KB), so 1,000 student photos use about 100 MB. |
| `s3` | Any S3-compatible bucket (Cloudflare R2, AWS S3, Supabase Storage) | When files grow beyond a few hundred MB. Set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Keep the bucket private. |
| `local` | `./storage` on disk | Development only; refused on Vercel. |

Files stored with one driver remain readable after switching to another (the database copy is checked first). Vercel limits request bodies to 4.5 MB, so PDF attachments are limited to 4 MB.

## 4. Vercel project

1. *Add New → Project* → import the GitHub repository. Framework: Next.js. `vercel.json` sets the build command (`npm run vercel-build` = `prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build` — the seed is idempotent and only loads configuration), region `fra1` and 60 s limits for PDF/report routes.
2. *Settings → Environment Variables* — add for **Production** and separately for **Preview (staging)**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | transaction-pooler connection string for that environment |
| `DIRECT_URL` | session/direct connection string (migrations) |
| `SEED_ADMIN_PASSWORD` | initial `admin` password (sensitive; used only when the database has no users) |
| `APP_URL` | `https://smis.bishopogez.com` (staging: its own URL) |
| `STORAGE_DRIVER` | `database` (or `s3` with the `S3_*` settings) |
| `SMTP_*` | when email is ready |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | when SMS is ready |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | when WhatsApp is ready |

Secrets are stored only in Vercel (encrypted) and GitHub secrets — **never** in the repository. `.env` is git-ignored.

3. Deploy `main`. The first build creates every table.

## 5. First run (production)

Run once from a trusted computer with the production `DATABASE_URL`:

```bash
SEED_ADMIN_PASSWORD='a-long-unique-password' DATABASE_URL='postgresql://…' npm run db:seed
```

This loads configuration only (roles, permissions, school profile, S1–S6, subjects, combinations, grading scales, payment methods). **Never run `npm run db:demo` against production** — it refuses to unless forced, and demo data must not be used in production.

Then sign in as `admin`, change the password and follow `ADMIN_MANUAL.md` § "Before go-live".

## 6. Domain

At the DNS host for bishopogez.com add `CNAME smis → cname.vercel-dns.com`, then in Vercel *Settings → Domains* add `smis.bishopogez.com`. Vercel issues and renews the HTTPS certificate automatically; HSTS is sent by the app.

## 7. Releases and migrations

* Work on a branch → pull request → CI (`.github/workflows/ci.yml`: lint, type-check, 51 tests against PostgreSQL, production build).
* Merge to `staging` → test on staging data → merge to `main` → production deploy (migrations run during the build).
* Schema changes are always made with `npx prisma migrate dev --name <change>` locally and committed. Never edit an applied migration.
* Roll back: Vercel *Deployments → Promote* a previous deployment. If a migration must be undone, write a new forward migration.

## 8. Monitoring

* Vercel → *Logs* and *Observability* for errors and slow requests; set an alert on 5xx rates.
* Settings → *Audit & logins* inside the app for user activity and failed sign-ins.
* Optional: add Sentry (free tier) for error alerts by email.
* Rate limiting: sign-in is limited in the app (per user and per IP). Add a Vercel Firewall rate-limit rule for `/login` and `/api/*` as a second layer.

## 9. Backups

See `BACKUP_AND_RECOVERY.md`. Summary: provider PITR + nightly encrypted `pg_dump` to R2 by `.github/workflows/backup.yml` + monthly restore test into staging.

## 10. Performance on low bandwidth

Pages are server-rendered (≈102–138 KB of JavaScript on first load, cached afterwards), tables page on the server, images are only loaded where needed, and responses are compressed. Staff on very slow links should use Chrome's *Lite* behaviour and avoid opening many PDFs at once (a stream's report cards are one PDF of ~150 KB).

## Status of this deployment

The application, migrations, tests and this configuration are complete and verified locally (production build + acceptance suite). Creating the Vercel/Neon/R2 accounts, DNS and secrets requires the school's own accounts and payment details, so production deployment has **not** been performed yet.
