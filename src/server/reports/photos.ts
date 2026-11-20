import "server-only";
import { prisma } from "@/lib/db";
import { readStoredFile } from "../storage";

/**
 * Loads JPEG/PNG photos for PDFs (react-pdf cannot render WebP). With `maxPx`, photos are shrunk to that size
 * (long side) so PDFs with many students stay small; if shrinking fails the original is used.
 */
export async function photoBuffers(fileIds: (string | null)[], opts: { maxPx?: number } = {}) {
  const ids = fileIds.filter(Boolean) as string[];
  const files = await prisma.storedFile.findMany({ where: { id: { in: ids }, mimeType: { in: ["image/jpeg", "image/png"] } } });
  const shrink = opts.maxPx ? await loadSharp() : null;
  const out = new Map<string, Buffer>();
  await Promise.all(files.map(async (f) => {
    const b = await readStoredFile(f.key, f.data).catch(() => null);
    if (!b) return;
    if (shrink && opts.maxPx) {
      const small = await shrink(b)
        .rotate()
        .resize(opts.maxPx, opts.maxPx, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toBuffer()
        .catch(() => null);
      out.set(f.id, small ?? b);
    } else out.set(f.id, b);
  }));
  return out;
}

async function loadSharp() {
  try { return (await import("sharp")).default; } catch { return null; }
}
