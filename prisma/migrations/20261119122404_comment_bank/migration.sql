-- CreateTable
CREATE TABLE "CommentTemplate" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "minScore" DECIMAL(5,2) NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentTemplate_role_minScore_idx" ON "CommentTemplate"("role", "minScore");
