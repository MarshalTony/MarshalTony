-- AlterTable
ALTER TABLE "GradeBand" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "SchoolSetting" ADD COLUMN     "altEmail" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "schoolPayCode" TEXT;

-- CreateTable
CREATE TABLE "LearningActivity" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityScore" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(3,1) NOT NULL,
    "enteredById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyRemark" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "enteredById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningActivity_termId_classId_subjectId_idx" ON "LearningActivity"("termId", "classId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityScore_activityId_studentId_key" ON "ActivityScore"("activityId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyRemark_termId_studentId_subjectId_key" ON "CompetencyRemark"("termId", "studentId", "subjectId");

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningActivity" ADD CONSTRAINT "LearningActivity_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityScore" ADD CONSTRAINT "ActivityScore_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "LearningActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityScore" ADD CONSTRAINT "ActivityScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyRemark" ADD CONSTRAINT "CompetencyRemark_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyRemark" ADD CONSTRAINT "CompetencyRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyRemark" ADD CONSTRAINT "CompetencyRemark_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
