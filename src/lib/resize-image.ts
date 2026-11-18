/**
 * Browser-only: shrink a photo before upload (long side ≤ maxSize px). Photos become JPEG;
 * PNGs stay PNG when keepPng is set (logos keep transparency). Returns the original file if it is
 * already small enough. Throws if the browser cannot decode the image (e.g. HEIC outside Safari).
 */
export async function resizeImage(file: File, maxSize = 800, keepPng = false): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const png = keepPng && file.type === "image/png";
  if (!png) {
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const type = png ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, 0.85));
  if (!blob) throw new Error("encode failed");
  const useOriginal = scale === 1 && file.size <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type);
  const out = useOriginal ? file : new File([blob], file.name.replace(/\.\w+$/, "") + (png ? ".png" : ".jpg"), { type });
  return { file: out, width, height };
}
