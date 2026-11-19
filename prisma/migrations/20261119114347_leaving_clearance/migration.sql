-- CreateTable
CREATE TABLE "StudentClearance" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "clearedById" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "StudentClearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavingRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "leavingDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "lastClass" TEXT NOT NULL,
    "conduct" TEXT NOT NULL,
    "remarks" TEXT,
    "destinationSchool" TEXT,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentClearance_studentId_office_key" ON "StudentClearance"("studentId", "office");

-- CreateIndex
CREATE UNIQUE INDEX "LeavingRecord_studentId_key" ON "LeavingRecord"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LeavingRecord_certificateNo_key" ON "LeavingRecord"("certificateNo");

-- AddForeignKey
ALTER TABLE "StudentClearance" ADD CONSTRAINT "StudentClearance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavingRecord" ADD CONSTRAINT "LeavingRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
