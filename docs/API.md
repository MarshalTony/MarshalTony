# API reference

The application has no public REST API: browsers talk to it through **server actions** (form submissions) and **route handlers** (downloads). Every endpoint authenticates the session cookie and checks permissions on the server.

## Server actions

Defined in `src/server/actions/*.ts` with the `action()` wrapper (`src/server/action.ts`): authenticate → check permission(s) → validate input with Zod → run → audit → return `{ ok, message | error, fieldErrors?, redirect? }`. When several permissions are listed, any one is sufficient. `—` means any signed-in user (with extra checks inside, e.g. own staff record).

| Module | Action | Permission(s) |
|---|---|---|
| academics | `saveSubject` | academics.manage |
| academics | `saveCombination` | academics.manage |
| academics | `addAllocation` | academics.manage |
| academics | `removeAllocation` | academics.manage |
| academics | `saveTimetableSlot` | academics.manage |
| academics | `deleteTimetableSlot` | academics.manage |
| academics | `saveCalendarEvent` | announcements.manage |
| academics | `deleteCalendarEvent` | announcements.manage |
| attendance | `saveStudentAttendance` | attendance.take |
| attendance | `saveStaffAttendance` | attendance.staff |
| auth | `loginAction` | public (sign-in / password flows) |
| auth | `logoutAction` | public (sign-in / password flows) |
| auth | `changePasswordAction` | public (sign-in / password flows) |
| auth | `requestResetAction` | public (sign-in / password flows) |
| auth | `resetPasswordAction` | public (sign-in / password flows) |
| communication | `saveAnnouncement` | announcements.manage |
| communication | `deleteAnnouncement` | announcements.manage |
| communication | `sendBulkMessage` | communication.send |
| communication | `saveAssignment` | learning.manage |
| communication | `saveMaterial` | learning.manage |
| communication | `deleteLearningItem` | learning.manage |
| exams | `createExam` | exams.manage |
| exams | `setExamStatus` | exams.manage |
| exams | `saveExamSubjects` | exams.manage |
| exams | `deleteExam` | exams.manage |
| exams | `saveMarksAction` | marks.enter |
| exams | `submitMarks` | marks.enter |
| exams | `reviewMarks` | marks.approve |
| exams | `approveAllSubmitted` | marks.approve |
| exams | `generateResultsAction` | exams.manage |
| exams | `saveComments` | reports.comment.class |
| exams | `autoComments` | reports.comment.dos |
| exams | `notifyResults` | communication.send |
| fees | `saveFeeStructure` | fees.manage |
| fees | `copyFeeStructures` | fees.manage |
| fees | `billTerm` | fees.manage |
| fees | `invoiceStudent` | fees.manage |
| fees | `recordPayment` | fees.collect |
| fees | `reversePaymentAction` | fees.reverse |
| fees | `postAdjustmentAction` | fees.reverse |
| fees | `sendFeeReminders` | communication.send |
| finance | `saveSupplier` | finance.manage |
| finance | `saveExpenseCategory` | finance.manage |
| finance | `requestExpense` | finance.manage |
| finance | `decideExpense` | finance.approve |
| finance | `markExpensePaid` | finance.manage |
| finance | `voidExpense` | finance.approve |
| finance | `recordIncome` | finance.manage |
| finance | `createPurchaseOrder` | finance.manage |
| finance | `setPurchaseOrderStatus` | finance.manage |
| finance | `pettyCashEntry` | finance.manage |
| finance | `saveBudget` | finance.manage |
| hr | `requestLeave` | — |
| hr | `decideLeave` | hr.leave.approve |
| hr | `requestAdvance` | payroll.manage |
| hr | `decideAdvance` | hr.leave.approve |
| hr | `preparePayroll` | payroll.manage |
| hr | `adjustPayslip` | payroll.manage |
| hr | `approvePayroll` | payroll.manage |
| hr | `saveAppraisal` | staff.manage |
| imports | `uploadImport` | — |
| imports | `commitImport` | — |
| imports | `cancelImport` | — |
| ops | `saveBook` | library.manage |
| ops | `issueBook` | library.manage |
| ops | `returnBook` | library.manage |
| ops | `payLibraryFine` | library.manage |
| ops | `saveItem` | inventory.manage |
| ops | `stockMovement` | inventory.manage |
| ops | `saveIncident` | discipline.manage |
| ops | `resolveIncident` | discipline.manage |
| ops | `saveCounselling` | welfare.confidential |
| ops | `saveMedical` | welfare.confidential |
| ops | `saveDriver` | transport.manage |
| ops | `saveVehicle` | transport.manage |
| ops | `saveRoute` | transport.manage |
| ops | `assignTransport` | transport.manage |
| ops | `removeTransport` | transport.manage |
| ops | `vehicleLog` | transport.manage |
| ops | `registerCandidates` | uneb.manage |
| ops | `updateCandidate` | uneb.manage |
| ops | `updatePractical` | uneb.manage |
| settings | `saveSchoolProfile` | settings.manage |
| settings | `saveReportTemplate` | settings.manage |
| settings | `saveNotificationPrefs` | settings.manage |
| settings | `saveAcademicYear` | settings.manage |
| settings | `saveTerm` | settings.manage |
| settings | `setCurrentTerm` | settings.manage |
| settings | `saveClass` | settings.manage |
| settings | `saveStream` | settings.manage |
| settings | `createUser` | users.manage |
| settings | `updateUserRoles` | users.manage |
| settings | `setUserActive` | users.manage |
| settings | `adminResetPassword` | users.manage |
| settings | `saveRole` | roles.manage |
| settings | `saveGradingScale` | exams.manage |
| settings | `saveResultRule` | exams.manage |
| settings | `saveExamType` | exams.manage |
| settings | `savePaymentMethod` | settings.manage |
| settings | `saveDepartment` | settings.manage |
| settings | `saveMessageTemplate` | settings.manage |
| staff | `saveStaff` | staff.manage |
| staff | `addQualification` | staff.manage |
| staff | `removeQualification` | staff.manage |
| staff | `createStaffAccount` | users.manage |
| students | `createStudent` | students.manage |
| students | `updateStudent` | students.manage |
| students | `transferStream` | students.manage |
| students | `changeStudentStatus` | students.manage |
| students | `setStudentSubjects` | students.manage |
| students | `promoteStudents` | students.manage |
| students | `saveGuardian` | guardians.manage |
| students | `linkGuardian` | guardians.manage |
| students | `unlinkGuardian` | guardians.manage |
| students | `createGuardianAccount` | guardians.manage |
| students | `createStudentAccount` | students.manage |

## Route handlers (HTTP GET)

Reports accept `format=pdf|xlsx|csv` (default PDF unless noted) and are written to the audit log.

| Route | Returns | Access |
|---|---|---|
| `/api/files/[id]` | Stored file (photo, logo, attachment) | Logo public; student photos: staff with `students.view`, the student, or their parents; staff photos: `staff.view`; materials: signed-in users |
| `/api/pdf/report-card?examId&studentId` \| `&streamId` \| `&classId` | Report card(s) PDF | Staff with `reportcards.generate`/`results.view`; parents (own children) and students (self) only for PUBLISHED exams; bulk: `reportcards.generate` |
| `/api/pdf/receipt/[id]` | Receipt PDF | Fee staff, the student, or linked parents |
| `/api/pdf/statement/[studentId]` | Fees statement | Fee staff, the student, or linked parents |
| `/api/pdf/admission-form/[studentId]` | Admission form PDF | `students.view` |
| `/api/pdf/id-cards?studentId` \| `?streamId` | Student ID cards PDF | `students.view` |
| `/api/export/students?classId&streamId&status&format` | Student register (default xlsx) | `students.view` |
| `/api/export/staff?status&format` | Staff list (salary column only with `hr.sensitive`) | `staff.view` |
| `/api/reports/broadsheet?examId&classId&streamId` | Exam broadsheet | `results.view` |
| `/api/reports/fees?type=payments\|daily\|outstanding\|classes&from&to&methodId&classId&streamId&termId` | Fees reports | `fees.view` |
| `/api/reports/finance?type=income-expenditure\|cashflow\|expenses&from&to` | Accounting reports | `finance.view`/`finance.manage` |
| `/api/reports/attendance?streamId&from&to` | Attendance summary | `attendance.view` |
| `/api/reports/payroll?year&month` | Payroll register | `payroll.manage` |
| `/api/reports/uneb?level&year` | UNEB candidate list | `uneb.manage` |
| `/api/reports/ops?type=inventory\|library\|transport\|discipline` | Operations reports | the module's permission |
| `/api/templates/[kind]` | Excel import template (`students`, `staff`, `opening_balances`, `allocations`, `attendance`, `marks?examId&streamId&subjectId`) | the import's permission |
| `/api/imports/[id]/errors` | Import error report (xlsx) | uploader or admin |
| `/api/backup` | Full data export (JSON, gzipped) | `backup.manage` |

## Status codes

`401` not signed in · `403` not permitted · `404` not found *or* not yours (other families' records are reported as not found) · `400` missing parameters.
