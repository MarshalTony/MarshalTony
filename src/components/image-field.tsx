"use client";
/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Field } from "./forms";
import { Input } from "./ui/input";

/**
 * Image file input that resizes in the browser before upload: smaller uploads on slow
 * connections, and small files to store. Photos become JPEG (max `maxSize` px on the long
 * side); PNG logos stay PNG so transparency is kept. HEIC photos from iPhones are converted
 * where the browser can decode them (Safari).
 */
export function ImageField({
  label, name, maxSize = 800, keepPng = false, currentUrl, hint,
}: { label: string; name: string; maxSize?: number; keepPng?: boolean; currentUrl?: string | null; hint?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(currentUrl ?? null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setInfo(null);
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const png = keepPng && file.type === "image/png";
      if (!png) {
        ctx.fillStyle = "#ffffff"; // JPEG has no transparency
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const type = png ? "image/png" : "image/jpeg";
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, 0.85));
      if (!blob) throw new Error("encode failed");
      // Keep the original if it is already a smaller supported image
      const useOriginal = scale === 1 && file.size <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type);
      const out = useOriginal ? file : new File([blob], file.name.replace(/\.\w+$/, "") + (png ? ".png" : ".jpg"), { type });
      const dt = new DataTransfer();
      dt.items.add(out);
      input.files = dt.files;
      setPreview(URL.createObjectURL(out));
      setInfo(`${w}×${h} px · ${Math.max(1, Math.round(out.size / 1024))} KB`);
    } catch {
      input.value = "";
      setPreview(currentUrl ?? null);
      setError("This picture could not be read. Please use a JPG or PNG photo.");
    }
  }

  return (
    <Field label={label} name={name} hint={error ? undefined : info ?? hint}>
      <div className="flex items-center gap-3">
        {preview ? (
          <img src={preview} alt="" className="h-16 w-14 shrink-0 rounded border border-slate-200 object-cover" />
        ) : (
          <div className="flex h-16 w-14 shrink-0 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">No image</div>
        )}
        <Input ref={ref} id={name} name={name} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={onChange} className="min-w-0 py-1" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Field>
  );
}
