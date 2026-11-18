import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { UserError } from "./action";

/** Allowed uploads, verified by magic bytes, not by the client-supplied type. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
];
const MAX_BYTES = { image: 2 * 1024 * 1024, pdf: 10 * 1024 * 1024 };

function s3() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
}
const LOCAL_DIR = path.join(process.cwd(), "storage");

export async function saveUpload(file: File, category: string, userId: string, opts: { imagesOnly?: boolean } = {}) {
  if (!file || file.size === 0) throw new UserError("No file selected.");
  // Serverless hosts have no persistent disk: refuse rather than silently lose the file.
  if (process.env.VERCEL && process.env.STORAGE_DRIVER !== "s3") throw new UserError("File storage is not configured. The administrator must set the S3 storage settings (see docs/DEPLOYMENT.md).");
  const buf = Buffer.from(await file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig || (opts.imagesOnly && !sig.mime.startsWith("image/"))) throw new UserError(opts.imagesOnly ? "Upload a JPG, PNG or WebP image." : "Upload a JPG, PNG, WebP image or PDF.");
  const limit = sig.mime === "application/pdf" ? MAX_BYTES.pdf : MAX_BYTES.image;
  if (buf.length > limit) throw new UserError(`File is too large (max ${limit / 1024 / 1024} MB).`);
  const key = `${category.toLowerCase()}/${new Date().getFullYear()}/${crypto.randomUUID()}.${sig.ext}`;
  if (process.env.STORAGE_DRIVER === "s3") {
    await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: buf, ContentType: sig.mime }));
  } else {
    const full = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  }
  return prisma.storedFile.create({
    data: { key, originalName: file.name.slice(0, 200), mimeType: sig.mime, size: buf.length, category, uploadedById: userId },
  });
}

export async function readStoredFile(key: string): Promise<Buffer> {
  if (process.env.STORAGE_DRIVER === "s3") {
    const out = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  const full = path.resolve(LOCAL_DIR, key);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error("Invalid key");
  return fs.readFile(full);
}

/** Returns an uploaded file from a FormData field, or null when none was chosen. */
export function fileFrom(fd: FormData, name: string): File | null {
  const f = fd.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}
