import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const COST = 12;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Password policy: 8+ chars with letters and digits. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 128) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain both letters and numbers.";
  return null;
}

/** Human-friendly temporary password, e.g. "Ogez-4821-kmtp". */
export function generateTempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = String(crypto.randomInt(1000, 9999));
  let tail = "";
  for (let i = 0; i < 4; i++) tail += letters[crypto.randomInt(letters.length)];
  return `Ogez-${digits}-${tail}`;
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
