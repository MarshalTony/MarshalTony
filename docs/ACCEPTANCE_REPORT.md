# Acceptance Test Report

Run: 2026-11-18T14:40:42.043Z against http://localhost:3100 (production build, fresh database with configuration seed and demo/training data).

**Browser checks: 18 of 18 passed.**

| # | Requirement (brief §30) | Result | Evidence |
|---|---|---|---|
| 1 | Student registration and Excel import | PASS | registered BOHS/2026/0241 with 10 subjects; import: 2 valid rows saved, 1 invalid row flagged and kept in the error report; siblings linked to one guardian |
| 2 | Student promotion | PASS | 41 S2 students promoted to S3 for 2027; their 2026 S2 enrollments kept as history (PROMOTED) |
| 3 | Parent account linking | PASS | parent account p772999001 created; a second child linked to the same parent |
| 4 | Examination setup | PASS | exam created for S1 with 16 subjects (max 100 each) and opened for marks entry |
| 5 | Marks entry (with invalid-mark protection) | PASS | 22 English marks for S1 A entered by the subject teacher (one ABS), 120/100 blocked, sheet submitted and locked |
| 6 | Excel marks import | PASS | pre-filled template for S1 B (20 students); 19 marks imported, the 250/100 row rejected and reported |
| 7 | Automatic grading | PASS | 40 subject results graded; every grade matches the configured A–E scale |
| 8 | Correct student ranking (independent SQL re-computation) | PASS | 240 class positions (160 O-Level by average, 80 A-Level by points) match an independent SQL RANK(); 28 tied positions shared correctly |
| 9 | Best 12 students in each class | PASS | S3 shows 12 students (12 plus 0 tied at the cut-off) |
| 10 | Best 3 students in each stream | PASS | 2 streams each list their top 3/3 by stream position |
| 11 | Report card generation | PASS | individual (8 KB) and bulk stream S1 A (143 KB) PDFs generated |
| 12 | Fees payment | PASS | UGX 400,000 MTN MoMo payment recorded (receipt RCT-2026-000001, transaction TXN-2026-00000001); a payment without its MoMo reference was refused |
| 13 | Automatic balance calculation | PASS | balance 1,030,000 → 630,000 after payment, back to 1,030,000 after an authorised reversal (original payment kept) |
| 14 | Receipt generation | PASS | receipt PDF (3.6 KB) with receipt number, transaction reference, amount in words and as-at balance |
| 15 | Parent access to their children's records only | PASS | parent sees exactly 2 linked children, fees and statement; another family's page/statement → 404, report card → 403; staff pages → sent back to the parent portal |
| 16 | Teacher access restrictions | PASS | teacher blocked from /fees, /finance, /settings/users, /hr/payroll, /students/new; fees/backup/receipt/payroll APIs refused; counselling & medical records hidden; cannot open Mathematics marks (not allocated) |
| 17 | Role-based permissions (configurable, enforced server-side) | PASS | librarian: library allowed, inventory denied; after the admin granted inventory.manage in Settings → Roles, access changed immediately without code changes |
| 18 | Database backup and restoration | PASS | pg_dump (412K, verified with pg_restore --list + SHA-256) restored into a new database; row counts source/restored: Student=243/243 Guardian=206/206 Staff=19/19 Mark=2201/2201 ExamResult=285/285 Payment=1/1 LedgerEntry=245/245 Invoice=243/243 AuditLog=25/25 User=23/23; total fees balance 308190000.00 = 308190000.00; 7 immutability triggers present after restore |
| 19 | Audit log functionality | PASS | 25 audit entries across 17 action types (all key actions present), searchable in Settings → Audit; deleting audit rows is blocked by the database; 5 successful sign-ins in login history |
