-- CreateEnum
CREATE TYPE "CombinationCategory" AS ENUM ('ARTS', 'SCIENCES');

-- AlterTable
ALTER TABLE "Stream" ADD COLUMN     "combinationCategory" "CombinationCategory";

-- AlterTable
ALTER TABLE "SubjectCombination" ADD COLUMN     "category" "CombinationCategory";


-- Category of the existing combinations (from their subjects): Physics, Chemistry, Biology or
-- Agriculture as a principal subject = Sciences; otherwise Arts (e.g. MEG). Editable in Classes & Subjects.
UPDATE "SubjectCombination" c SET "category" = CASE WHEN EXISTS (
  SELECT 1 FROM "CombinationSubject" cs JOIN "Subject" s ON s."id" = cs."subjectId"
  WHERE cs."combinationId" = c."id" AND s."code" IN ('A-PHY', 'A-CHE', 'A-BIO', 'A-AGR')
) THEN 'SCIENCES'::"CombinationCategory" ELSE 'ARTS'::"CombinationCategory" END
WHERE c."category" IS NULL;

-- A-Level streams named like ARTS / SCIENCE(S) hold that category.
UPDATE "Stream" st SET "combinationCategory" = CASE WHEN upper(st."name") LIKE '%ART%' THEN 'ARTS'::"CombinationCategory" ELSE 'SCIENCES'::"CombinationCategory" END
FROM "SchoolClass" sc
WHERE sc."id" = st."classId" AND sc."level" = 'A_LEVEL' AND st."combinationCategory" IS NULL
  AND (upper(st."name") LIKE '%ART%' OR upper(st."name") LIKE '%SCIEN%');
