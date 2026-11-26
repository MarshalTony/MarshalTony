"use client";
/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { Eraser, PenLine, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { clearPaper, padBox } from "@/lib/signature";

const PAD_W = 600, PAD_H = 200;

/**
 * Headteacher's signature: draw it with a finger / mouse, or upload a photo or scan of it signed on white paper.
 * Either way it becomes a transparent PNG (paper removed, trimmed) put into the form field `name` for upload.
 */
export function SignatureField({ name, currentUrl }: { name: string; currentUrl?: string | null }) {
  const input = React.useRef<HTMLInputElement>(null);
  const pad = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = React.useState<"draw" | "upload">("draw");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [drawn, setDrawn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /** Trim, clear the paper and hand the PNG to the hidden file input. */
  const finish = React.useCallback(async (source: HTMLCanvasElement) => {
    const ctx = source.getContext("2d")!;
    const data = ctx.getImageData(0, 0, source.width, source.height);
    const box = clearPaper(data.data, source.width, source.height);
    if (!box) { setError("No signature found — the picture looks blank. Sign with a dark pen on white paper."); return; }
    ctx.putImageData(data, 0, 0);
    const b = padBox(box, source.width, source.height, 6);
    const out = document.createElement("canvas");
    const scale = Math.min(1, 900 / b.w);
    out.width = Math.round(b.w * scale); out.height = Math.round(b.h * scale);
    out.getContext("2d")!.drawImage(source, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
    const blob: Blob = await new Promise((res) => out.toBlob((x) => res(x!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "signature.png", { type: "image/png" }));
    if (input.current) input.current.files = dt.files;
    setPreview(URL.createObjectURL(blob));
    setError(null);
  }, []);

  // ---- drawing pad
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAD_W, y: ((e.clientY - r.top) / r.height) * PAD_H };
  };
  const clearPad = () => {
    const c = pad.current; if (!c) return;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, PAD_W, PAD_H);
    setDrawn(false); setPreview(null);
    if (input.current) input.current.value = "";
  };
  React.useEffect(() => { if (mode === "draw") clearPad(); }, [mode]);
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !pad.current) return;
    const p = point(e), ctx = pad.current.getContext("2d")!;
    ctx.strokeStyle = "#0b1f5c"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setDrawn(true);
  };
  const up = () => { drawing.current = false; };

  // ---- upload a photo / scan
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = "";
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      await finish(c);
    } catch { setError("Could not read that picture. Use a JPG or PNG photo of the signature."); }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={mode === "draw" ? "default" : "outline"} onClick={() => setMode("draw")}><PenLine />Draw the signature</Button>
        <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => { setMode("upload"); setPreview(null); }}><Upload />Upload a photo of it</Button>
      </div>
      <input ref={input} type="file" name={name} accept="image/png" className="hidden" tabIndex={-1} aria-hidden />
      {mode === "draw" ? (
        <div className="space-y-2">
          <canvas
            ref={pad} width={PAD_W} height={PAD_H} aria-label="Signature pad"
            className="w-full max-w-[600px] touch-none rounded-md border-2 border-dashed border-slate-300 bg-white"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={clearPad}><Eraser />Clear</Button>
            <Button type="button" size="sm" variant="secondary" disabled={!drawn} onClick={() => pad.current && finish(pad.current)}>Use this signature</Button>
          </div>
          <p className="text-xs text-slate-500">Sign in the box with a finger (phone or tablet) or the mouse, then press <b>Use this signature</b>.</p>
        </div>
      ) : (
        <div className="space-y-1">
          <input type="file" accept="image/*" onChange={onFile} aria-label="Signature photo" className="block text-sm" />
          <p className="text-xs text-slate-500">Sign with a dark pen on plain white paper and take a clear, close photo (or scan). The white paper is removed automatically.</p>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {(preview || currentUrl) && (
        <div>
          <p className="text-xs font-medium text-slate-600">{preview ? "New signature (not saved yet):" : "Current signature:"}</p>
          <div className="mt-1 inline-block rounded border border-slate-200 p-2" style={{ backgroundImage: "linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%),linear-gradient(45deg,#f1f5f9 25%,transparent 25%,transparent 75%,#f1f5f9 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" }}>
            <img src={preview ?? currentUrl!} alt="Headteacher's signature" className="h-20 w-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
