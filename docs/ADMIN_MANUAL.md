# Administrator manual

For the System Administrator, Headteacher and Director of Studies.

## First sign-in

1. Go to https://smis.bishopogez.com and sign in as `admin` with the temporary password from setup. You must choose a new password (8+ characters, letters and numbers).
2. **Settings → School profile:** check name, motto, address, phone (+256 772 314 931), email (ogezhigh@gmail.com), website, UNEB centre numbers, headteacher's name; upload the school logo (PNG/JPG). Set the report-card options and the report footer.

## Before go-live (checklist)

| # | Where | What |
|---|---|---|
| 1 | Settings → Years & terms | Confirm the academic year and the three term dates (opening, closing, next term begins — printed on report cards). Make the correct term **current**. |
| 2 | Settings → Classes & streams | S1–S6 exist with stream "A". Add/rename streams (e.g. A, B or East, West) and set capacities. Class teachers are set here after staff are registered. |
| 3 | Classes & Subjects | Check subjects, categories (compulsory/elective for O-Level; principal/subsidiary for A-Level), weights and A-Level combinations. |
| 4 | Settings → Grading & ranking | **The DOS must confirm** the grading bands and ranking rules. Seeded: O-Level competency scale A–E (average ranking) and a legacy D1–F9 scale; A-Level principal A–F (6–0 points) and subsidiary O/F (1/0); A-Level ranked by points. Ties share a position (1, 1, 3). Absent papers are left out of averages. Best 12 per class / best 3 per stream. |
| 5 | Settings → Lists & templates | Exam types, payment methods, departments, SMS/email templates. |
| 6 | Staff | Register staff (or import from Excel), then create login accounts from each staff profile with the right roles. |
| 7 | Classes & Subjects → Teacher allocations | Allocate teachers to subjects and streams (or import). Teachers can only enter marks and attendance for their allocations. |
| 8 | Students | Import students from Excel (Excel Imports → Student registration template) or register individually. Check subjects on a few profiles. |
| 9 | School Fees → Fee structures | Enter fees per class for day and boarding students; then *Issue term invoices*. Import opening balances (Excel Imports → Fees opening balances) **once**. |
| 10 | Parents | Create parent portal accounts from the student or guardian pages and give parents their username and temporary password. |

## Users, roles and permissions

* **Settings → Users:** create staff accounts, assign one or more roles, reset passwords (a temporary password is shown once — the user must change it), deactivate leavers (signs them out immediately). Only a System Administrator can grant the administrator role.
* **Settings → Roles & permissions:** each role is a set of permissions. Edit roles to fit how the school works (e.g. give the Deputy fee-viewing rights). Create new roles (e.g. *Matron*). The System Administrator role always has every permission.
* Sensitive permissions: `hr.sensitive` (salaries, bank, TIN/NSSF), `welfare.confidential` (counselling and medical), `fees.reverse` (reversals and scholarships), `finance.approve` (vouchers), `marks.approve` (approve and correct marks), `backup.manage`.

## Termly cycle

1. **Start of term:** make the term current; copy fee structures from the previous term and adjust; issue term invoices; publish the term calendar and announcements.
2. **Examinations (DOS):** Examinations → New examination (type, term, classes; subjects are added automatically) → adjust max marks → *Open for marks entry*. Teachers enter or import marks and submit. Approve or return each mark sheet. *Generate results* (re-generate after any correction). Class teachers, DOS and Headteacher write comments. *Publish* → parents and students can see results and download report cards; optionally *Notify parents*.
3. **O-Level end-of-term report (competency-based):** teachers record Activities of Integration during the term (Activities (AOI) page). Set the EOT exam papers **out of 80** (or 100 — marks are converted to /80). After the EOT results are generated, O-Level report cards for that exam print in the school's two-page format: page 1 lists each subject's chapters, scores out of 3, average, identifier, descriptor, competency remark and subject teacher; page 2 shows *Out of 20* (average ÷ 3 × 20) + *EOT/80* = *Total (100%)* with the grade (A 90–100, B 80–89, C 60–79, D 50–59, E 0–49), the class-teacher and head-teacher comments and the term dates. A subject with chapters but no scores counts 0/20; a subject with no chapters shows its EOT mark only. No positions are printed. The format can be switched off in Settings → School profile → Report card template; BOT/MOT and A-Level reports keep the standard layout. Identifier bands and grade descriptors are editable in Settings → Grading & ranking.
4. **Combined term result:** create a *Term Final* exam marked as combined, choose component exams and weights (e.g. BOT 20, MOT 20, EOT 60). Approve the components' marks, then generate the combined results.
5. **Corrections after approval:** DOS opens the mark sheet → *Correct marks* → must give a reason; every change is in the audit log.

## End of year

1. Create the next academic year and its terms (Settings → Years & terms).
2. Students → **Promote**: choose the class and the new year; each student can be promoted, repeat, graduate (S4 leavers / S6) or be skipped. Previous classes stay in the student's history and past results keep their original class.
3. Make the first term of the new year current.
4. UNEB: create candidate records for S4/S6, record index numbers and practical dates.

## Finance controls

* Payments, invoices, reversals, adjustments and the audit log **cannot be edited or deleted** (enforced by the database). Mistakes are corrected with a **reversal** (with reason) and a new payment, or an **adjustment**.
* Non-cash payments require the bank/MoMo/cheque reference; the same reference cannot be recorded twice.
* Payment vouchers: requested by the bursar, approved by the Headteacher (a person cannot approve their own voucher), then marked paid. Rejected/voided vouchers stay on record.

## Audit and security

* Settings → **Audit & logins**: every create/update/delete, approvals, payments, reversals, imports, report downloads and sign-ins (with IP address). Five failed sign-ins lock an account for 15 minutes.
* Review termly: who has admin/bursar/DOS roles; deactivate staff who have left (Staff → status *Exited* also disables their login).

## Messaging

Set up SMS/email/WhatsApp credentials (see EXTERNAL_SERVICES.md). Until then, messages are recorded as *NOT CONFIGURED*. Optional automatic SMS on payment and on absence: Settings → School profile → Automatic notifications.

## Backups

See BACKUP_AND_RECOVERY.md. Settings → Backup offers a full data export for offline safekeeping (contains personal data — store securely).
