import { execSync } from "node:child_process";

/** Prepares the TEST database non-destructively: apply migrations + idempotent seed. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://smis:smis_dev_pw@localhost:5432/smis_test";
  if (!/smis_test|_test\b|test/i.test(url)) throw new Error("Refusing to run integration tests against a database whose name does not contain 'test'.");
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, SEED_ADMIN_PASSWORD: "TestAdmin123" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
