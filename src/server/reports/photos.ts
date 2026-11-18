import "server-only";
import { prisma } from "@/lib/db";
import { readStoredFile } from "../storage";

/** Loads JPEG/PNG photos for PDFs (react-pdf cannot render WebP). */
export async function photoBuffers(fileIds: (string | null)[]) {
  const ids = fileIds.filter(Boolean) as string[];
  const files = await prisma.storedFile.findMany({ where: { id: { in: ids }, mimeType: { in: ["image/jpeg", "image/png"] } } });
  const out = new Map<string, Buffer>();
  await Promise.all(files.map(async (f) => {
    const b = await readStoredFile(f.key).catch(() => null);
    if (b) out.set(f.id, b);
  }));
  return out;
}
