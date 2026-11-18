# Security and data protection

## Controls implemented

| Area | Control | Where |
|---|---|---|
| Passwords | bcrypt (cost 12); policy 8+ chars with letters and digits; temporary passwords must be changed at first sign-in; changing a password signs out other devices | `src/server/passwords.ts`, `actions/auth.ts` |
| Sign-in | Constant-time path for unknown users; lockout after 5 failures per user or 30 per IP in 15 minutes; full login history (success, reason, IP, device) | `src/server/auth.ts` |
| Sessions | 256-bit random token, only its SHA-256 stored; `HttpOnly`, `Secure` (production), `SameSite=Lax`; 12-hour sliding expiry; revoked on logout, deactivation, password reset | `src/server/auth.ts` |
| Password reset | Single-use token (SHA-256 stored), 1-hour expiry, max 3 per 15 min, generic response (no account enumeration) | `actions/auth.ts` |
| Authorisation | Permission checks on the server for every page, server action and route handler; record-level checks: teachers ↔ allocations, class teachers ↔ their stream, parents ↔ linked children, students ↔ self; other families' records return 404 | `src/server/auth.ts`, `server/portal.ts`, `server/fees/access.ts`, `exams/marks.ts` |
| Segregation of duties | Users cannot approve their own expense vouchers or leave; only administrators grant the admin role; correcting approved marks needs a reason and approver rights | `actions/finance.ts`, `actions/hr.ts`, `exams/marks.ts` |
| Input validation | Zod schemas on every action; numeric ranges (marks ≤ max, positive money); dates validated (impossible dates rejected) | `src/server/action.ts`, `server/schemas.ts` |
| SQL injection | Prisma parameterised queries; the few raw queries use tagged templates (parameterised) | — |
| XSS | React escaping; no `dangerouslySetInnerHTML`; strict Content-Security-Policy; CSV/Excel exports neutralise formula injection | `next.config.ts`, `server/http.ts` |
| CSRF | Server actions verify the request origin (Next.js); cookies are `SameSite=Lax`; route handlers are read-only GETs | — |
| Clickjacking & headers | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy | `next.config.ts` |
| File uploads | Type checked by magic bytes (JPG/PNG/WebP/PDF), size limits (2 MB images, 10 MB PDFs), random object keys, private storage, served only through a permission-checked route | `server/storage.ts`, `api/files/[id]` |
| Financial integrity | Database triggers block UPDATE/DELETE on payments, reversals, adjustments, invoices, ledger and audit log; CHECK constraints on amounts; receipt numbers from an atomic counter | `prisma/migrations/*_financial_immutability` |
| Audit | Create/update/delete, approvals, payments, reversals, imports, report and backup downloads, sign-outs — with user, time, IP and details; the audit log itself is immutable | `server/audit.ts` |
| Confidential data | Salaries/bank/TIN/NSSF only with `hr.sensitive` (never sent to the browser otherwise); counselling/medical only with `welfare.confidential`; counselling content is not copied into the audit log | `actions/staff.ts`, `welfare/page.tsx` |
| Secrets | Only in environment variables (Vercel / GitHub secrets); `.env` is git-ignored | — |
| Backups | Encrypted, checksummed, off-site; monthly restore tests | `BACKUP_AND_RECOVERY.md` |

## Uganda Data Protection and Privacy Act, 2019 — school obligations

The system supports compliance, but the school remains the *data controller*. Recommended actions (not legal advice):

1. **Register** with the Personal Data Protection Office (PDPO, under NITA-U) as a data controller/processor.
2. Appoint a **data protection officer** (e.g. the Deputy Headteacher) and keep this system's access list under review.
3. **Inform parents** (admission form / prospectus) what data is collected, why, who can see it, how long it is kept, and how to request access or correction; obtain consent where required, particularly for photographs and medical information about children.
4. **Minimise:** only fill fields you need; restrict welfare and HR data to the roles above.
5. **Retention:** agree retention periods (e.g. academic records permanently; financial records as required for audit; welfare notes for a defined period after the student leaves).
6. **Breach response:** if personal data is exposed, contain it (deactivate accounts, rotate credentials), record it, and notify the PDPO and affected people as the Act requires.
7. **Processors:** the hosting providers (Vercel, the database provider, Cloudflare, SMS/email providers) process data on the school's behalf — keep their data-processing terms on file. Data is hosted outside Uganda (EU region); include this in the privacy notice.

## Reporting a security problem

Contact the system administrator immediately; deactivate any suspected compromised account from Settings → Users (this signs it out everywhere).
