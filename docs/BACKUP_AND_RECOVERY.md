# Backup and recovery

## What is backed up, and how

| Layer | How | Retention | Restores |
|---|---|---|---|
| 1. Provider snapshots + point-in-time recovery (Neon / Supabase) | Automatic | 7–30 days (plan dependent) | Any moment in the window; fastest recovery |
| 2. Nightly logical backup | `.github/workflows/backup.yml` runs `scripts/backup.sh`: `pg_dump` (custom format), integrity check with `pg_restore --list`, SHA-256 checksum, GPG encryption, upload to the R2 backups bucket | Keep 30 daily + 12 monthly (set an R2 lifecycle rule) | Any day; independent of the database provider |
| 3. Ad-hoc data export | *Settings → Backup → Download data export* (all tables as gzipped JSON, audited) | Kept by the school offline | Reference / migration |
| Files (photos, logo, documents) | R2 bucket with object versioning enabled | 30 days of versions | Restore an object version in the R2 console |

The backup files contain personal data: keep them encrypted, never e-mail them, and restrict the GPG private key to the Headteacher and the system administrator (store it offline, e.g. on an encrypted USB in the school safe).

## Restore procedure

**Always restore into staging first.**

1. Download the backup and its `.sha256` from the backups bucket.
2. Restore into a fresh staging database:
   ```bash
   TARGET_DATABASE_URL='postgresql://…staging…' scripts/restore.sh smis-20261118T001700Z.dump.gpg
   ```
   (verifies the checksum, decrypts, asks you to type RESTORE, then runs `pg_restore --clean`.)
3. Check on staging: sign in, open a few students, fee balances, latest exam results; compare student and payment counts with expectations.
4. **Production restore** needs written approval from the Headteacher. Put the app in maintenance (Vercel → pause the production deployment or point the domain to a maintenance page), restore with the production `TARGET_DATABASE_URL`, re-run `npx prisma migrate deploy`, smoke-test, re-open.
5. Record the incident: date, cause, backup used, data lost (time since the backup), who approved.

For recovery to a specific minute, use the provider's point-in-time restore (creates a new branch/database), verify it, then switch `DATABASE_URL`.

## Verified

`scripts/acceptance.sh` performs a real backup and restore into a new database and compares row counts of 10 key tables, the total fee balance, and confirms the 7 immutability triggers survive the restore. Latest result: see `ACCEPTANCE_REPORT.md` (§18, PASS).

## Routine

| When | Who | Task |
|---|---|---|
| Daily | automatic | nightly backup job — check the GitHub Actions run is green weekly |
| Monthly | system administrator | restore last night's backup into staging and record the result |
| Termly | Headteacher | review who holds admin, bursar and DOS access; deactivate leavers |
| Yearly | administrator | rotate database and storage credentials; confirm PAYE/NSSF rates |
