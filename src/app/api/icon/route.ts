import { prisma } from "@/lib/db";
import { readStoredFile } from "@/server/storage";

const SIZES = [16, 32, 48, 64, 180, 192, 512];

/** "BO" badge (as in the app header) when no logo has been uploaded. */
function badge(size: number) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1d4ed8"/>
  <text x="32" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="28" fill="#ffffff">BO</text></svg>`);
}

/**
 * Favicon / app icon: the school logo (Settings → School profile) shrunk to ?size= (16–512, default 32), as PNG.
 * Public (the logo is public), cached for an hour so a new logo shows up the same day.
 */
export async function GET(req: Request) {
  const want = Number(new URL(req.url).searchParams.get("size")) || 32;
  const size = SIZES.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  // ?solid=1 (home-screen app icon): crest on a white square with a little margin, never transparent.
  const solid = new URL(req.url).searchParams.get("solid") === "1";
  const sharp = (await import("sharp")).default;
  let png: Buffer | null = null;
  try {
    const school = await prisma.schoolSetting.findUnique({ where: { id: 1 }, select: { logoFileId: true } });
    const file = school?.logoFileId ? await prisma.storedFile.findUnique({ where: { id: school.logoFileId } }) : null;
    if (file && file.category === "PUBLIC") {
      const raw = await readStoredFile(file.key, file.data);
      // Fit the whole logo inside a square on white (JPEG logos have no transparency anyway).
      if (solid) {
        const inner = Math.round(size * 0.84), pad = Math.floor((size - inner) / 2);
        png = await sharp(raw).rotate().resize(inner, inner, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" })
          .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: "#ffffff" }).png().toBuffer();
      } else {
        png = await sharp(raw).rotate().resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: file.mimeType === "image/png" ? 0 : 1 } }).png().toBuffer();
      }
    }
  } catch {
    png = null; // fall back to the badge
  }
  if (!png) png = await sharp(badge(size)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
