# Administrator manual

For the System Administrator, Headteacher and Director of Studies.

## First sign-in

1. Go to https://smis.bishopogez.com and sign in as `admin` with the temporary password from setup. You must choose a new password (8+ characters, letters and numbers).
2. **Settings → School profile:** check name, motto, address, phone (+256 772 314 931), email (ogezhigh@gmail.com), website, UNEB centre numbers, headteacher's name; upload the school logo (PNG/JPG) — it is also used as the browser-tab and phone home-screen icon. Set the report-card options and the report footer.

## Before go-live (checklist)

| # | Where | What |
|---|---|---|
| 1 | Settings → Years & terms | Confirm the academic year and the three term dates (opening, closing, next term begins — printed on report cards). Make the correct term **current**. |
| 2 | Settings → Classes & streams | S1–S6 exist with stream "A". Add/rename streams (e.g. A, B or East, West) and set capacities. Class teachers are set here after staff are registered. |
| 3 | Classes & Subjects | Set the **Report order** tab (the order subjects print on report cards and broadsheets: ▲ / ▼, then *Save order*). Check subjects, categories (compulsory/elective for O-Level; principal/subsidiary for A-Level), weights and A-Level combinations. |
| 4 | Settings → Grading & ranking | **The DOS must confirm** the grading bands and ranking rules. Seeded: O-Level competency scale A–E (average ranking) and a legacy D1–F9 scale; A-Level principal A–F (6–0 points) and subsidiary O/F (1/0); A-Level ranked by points. Ties share a position (1, 1, 3). Absent papers are left out of averages. Best 12 per class / best 3 per stream. |
| 5 | Settings → Lists & templates | Exam types, payment methods, departments, SMS/email templates. |
| 6 | Staff | Register staff (or import from Excel), then create login accounts from each staff profile with the right roles. |
| 7 | Classes & Subjects → **Allocation grid** | For each class: subjects down the side, streams across — pick the teacher in each cell (the number after a name is their current load), set each stream's **class teacher** in the top row, use *→ all streams* to copy a row, then *Save*. *Copy from <last year>* fills empty cells at the start of a new year. (The list view and Excel import still work.) Teachers can only enter scores, marks and attendance for their allocations — Academics → Enter Scores lists only these. |
| 8 | Students | Import students from Excel (Excel Imports → Student registration template) or register individually. Check subjects on a few profiles. |
| 9 | School Fees → Fee structures | Enter fees per class for day and boarding students; then *Issue term invoices*. Import opening balances (Excel Imports → Fees opening balances) **once**. |
| 10 | Parents | Create parent portal accounts from the student or guardian pages and give parents their username and temporary password. |

## Users, roles and permissions

* **Settings → Users:** create staff accounts, assign one or more roles, reset passwords (a temporary password is shown once — the user must change it), deactivate leavers (signs them out immediately). Only a System Administrator can grant the administrator role.
* **Settings → Roles & permissions:** each role is a set of permissions. Edit roles to fit how the school works (e.g. give the Deputy fee-viewing rights). Create new roles (e.g. *Matron*). The System Administrator role always has every permission.
* Sensitive permissions: `hr.sensitive` (salaries, bank, TIN/NSSF), `welfare.confidential` (counselling and medical), `fees.reverse` (reversals and scholarships), `finance.approve` (vouchers), `marks.approve` (approve and correct marks), `backup.manage`.

## Termly cycle

1. **Start of term:** make the term current; copy fee structures from the previous term and adjust; issue term invoices; publish the term calendar and announcements.
2. **Examinations (DOS):** Examinations → New examination (type, term, classes; subjects are added automatically). Give two maximum marks: **O-Level (S1–S4)** — 80 for end of term, because Activities of Integration add the other 20 — and **A-Level (S5–S6)**, normally 100 (A-Level has no activities). Examinations are **always open for marks entry** — teachers can enter and correct marks at any time; there is no open/close step and no DOS approval (unless approval is switched on in Settings). *Publish results* makes results and report cards visible to parents and students (*Unpublish* hides them again). **Edit** (on the list or the exam page) changes the name, type, term, dates and **classes** — added classes get their subjects with the exam's usual maximum mark; a class with marks cannot be removed. **Delete** removes an exam; if it has marks you must type its name to confirm, and its marks and results are deleted too. Teachers enter or import marks. **By default marks need no DOS approval**: saved marks count straight away, and printing report cards automatically refreshes the results with the latest marks. *Close* the examination to stop marks entry. (To require approval, tick *Marks need DOS approval* in Settings → School profile; teachers then submit and the DOS approves or returns each mark sheet.) *Generate results* to see rankings and broadsheets. Class teachers, DOS and Headteacher write comments. *Publish* → parents and students can see results and download report cards; optionally *Notify parents*.
3. **S1–S4 report cards (competency-based, every exam — BOT, MOT, EOT):** teachers record Activities of Integration during the term (Academics → Enter Scores → Activity scores) and the EOT paper under Enter Scores → End of term scores. Set the EOT exam papers **out of 80** (or 100 — marks are converted to /80). S1–S4 report cards for any exam print in the school's two-page format: page 1 lists each subject's chapters, scores out of 3, average, identifier, descriptor, competency remark and subject teacher; page 2 ("Summary of … Performance") shows *Out of 20* (average ÷ 3 × 20) + *the exam out of 80* (e.g. BOT/80, EOT/80 — papers out of 100 are scaled) = *Total (100%)* with the grade (A 90–100, B 80–89, C 60–79, D 50–59, E 0–49), the class-teacher and head-teacher comments and the term dates. A subject with chapters but no scores counts 0/20; a subject with no chapters shows its EOT mark only. No positions are printed. The format can be switched off in Settings → School profile → Report card template; A-Level (S5–S6) reports keep the standard layout. Identifier bands and grade descriptors are editable in Settings → Grading & ranking.
4. **Before printing — Readiness (Examinations → exam → Readiness, also on Report Cards):** percentage of exam marks, activity scores (S1–S4) and class-/head-teacher comments done; a **Teachers to follow up** list (what each teacher still owes, e.g. *English S1 A: 3 mark(s) missing*, *Biology S1 B: no activity chapters*); and per class every stream × subject with the teacher and a coloured progress bar (green complete, amber partly done, red not started). Click a bar to open that mark sheet; *Only what is incomplete* hides finished work.
5. **Combined term result:** create a *Term Final* exam marked as combined, choose component exams and weights (e.g. BOT 20, MOT 20, EOT 60). Approve the components' marks, then generate the combined results.
6. **Corrections after approval:** DOS opens the mark sheet → *Correct marks* → must give a reason; every change is in the audit log.

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
