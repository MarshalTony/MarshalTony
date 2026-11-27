-- System administrator support contact shown on the sign-in page
ALTER TABLE "SchoolSetting" ADD COLUMN "supportName" TEXT;
ALTER TABLE "SchoolSetting" ADD COLUMN "supportPhone" TEXT;
