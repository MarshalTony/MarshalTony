-- Examination papers: A-Level principal subjects are sat as two papers (P/1, P/2); marks are entered per paper.
-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "paperCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Mark" ADD COLUMN     "paper" INTEGER NOT NULL DEFAULT 1;

-- Unique mark per exam × student × subject × paper
DROP INDEX "Mark_examId_studentId_subjectId_key";
CREATE UNIQUE INDEX "Mark_examId_studentId_subjectId_paper_key" ON "Mark"("examId", "studentId", "subjectId", "paper");

-- School rule: every A-Level subject has 2 papers except General Paper and Subsidiary Mathematics (1 paper).
UPDATE "Subject" SET "paperCount" = 2 WHERE "level" = 'A_LEVEL' AND "code" NOT IN ('GP', 'S-MTC');
