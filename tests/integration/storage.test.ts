import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { readStoredFile, saveUpload, storageDriver } from "@/server/storage";
import { adminUser } from "./helpers";

// Smallest valid PNG (1×1) and a PDF header
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n%test\n");

describe("database file storage", async () => {
  const user = await adminUser();
  const prev = process.env.STORAGE_DRIVER;
  beforeAll(() => { process.env.STORAGE_DRIVER = "database"; });
  afterAll(() => { process.env.STORAGE_DRIVER = prev; });

  it("defaults to the database on Vercel and to local disk elsewhere", () => {
    const saved = { d: process.env.STORAGE_DRIVER, v: process.env.VERCEL };
    delete process.env.STORAGE_DRIVER;
    process.env.VERCEL = "1";
    expect(storageDriver()).toBe("database");
    delete process.env.VERCEL;
    expect(storageDriver()).toBe("local");
    process.env.STORAGE_DRIVER = saved.d;
    if (saved.v) process.env.VERCEL = saved.v;
  });

  it("stores an image in the database and reads it back byte-for-byte", async () => {
    const rec = await saveUpload(new File([PNG], "photo.png", { type: "image/png" }), "STUDENT_PHOTO", user.id, { imagesOnly: true });
    expect(rec.mimeType).toBe("image/png");
    const row = await prisma.storedFile.findUniqueOrThrow({ where: { id: rec.id } });
    expect(Buffer.from(row.data!).equals(PNG)).toBe(true);
    expect((await readStoredFile(rec.key)).equals(PNG)).toBe(true);
  });

  it("checks the real file type, not the name or declared type", async () => {
    await expect(saveUpload(new File([Buffer.from("<script>alert(1)</script>")], "evil.png", { type: "image/png" }), "STUDENT_PHOTO", user.id, { imagesOnly: true })).rejects.toThrow(/JPG, PNG or WebP/);
    await expect(saveUpload(new File([PDF], "doc.pdf", { type: "application/pdf" }), "STUDENT_PHOTO", user.id, { imagesOnly: true })).rejects.toThrow(/JPG, PNG or WebP/);
    const pdf = await saveUpload(new File([PDF], "notes.pdf", { type: "application/pdf" }), "MATERIAL", user.id);
    expect(pdf.mimeType).toBe("application/pdf");
  });

  it("enforces size limits (images 2 MB, PDFs 4 MB)", async () => {
    const bigPng = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await expect(saveUpload(new File([bigPng], "big.png"), "STUDENT_PHOTO", user.id, { imagesOnly: true })).rejects.toThrow(/too large \(max 2 MB\)/);
    const bigPdf = Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]);
    await expect(saveUpload(new File([bigPdf], "big.pdf"), "MATERIAL", user.id)).rejects.toThrow(/too large \(max 4 MB\)/);
  });

  it("exports binary data as base64 in the data export", () => {
    const json = JSON.stringify({ data: new Uint8Array(PNG) }, (_k, v) => (v instanceof Uint8Array ? { base64: Buffer.from(v).toString("base64") } : v));
    expect(JSON.parse(json).data.base64).toBe(PNG.toString("base64"));
  });
});
