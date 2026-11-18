-- Results snapshot may record MISSING marks, so status becomes free text (cast keeps existing data).
ALTER TABLE "SubjectResult" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
