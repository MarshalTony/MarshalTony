"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { brandScale, isHex, logoSwatches, PRESETS } from "@/lib/theme";

/**
 * Pick the school's theme colour: colours found in the crest, a few suggestions, or any colour.
 * Shows a live preview of the menu bar, a button and a link. Puts "#rrggbb" ("" = default blue) in the field `name`.
 */
export function ThemeColorField({ name, current, logoUrl }: { name: string; current: string | null; logoUrl: string | null }) {
  const [value, setValue] = React.useState(current ?? "");
  const [fromLogo, setFromLogo] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!logoUrl) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      const ctx = c.getContext("2d"); if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      try { setFromLogo(logoSwatches(ctx.getImageData(0, 0, 64, 64).data)); } catch { /* picture not readable */ }
    };
    img.src = logoUrl;
  }, [logoUrl]);

  const s = brandScale(value || null);
  const swatch = (hex: string, label: string, v = hex) => (
    <button
      key={label} type="button" title={label} aria-label={label} aria-pressed={value === v} onClick={() => setValue(v)}
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${value === v ? "border-slate-900" : "border-white shadow ring-1 ring-slate-200"}`}
      style={{ background: hex }}
    >
      {value === v && <Check className="h-4 w-4 text-white" />}
    </button>
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <input type="hidden" name={name} value={value} />
      <div className="space-y-4">
        {fromLogo.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Colours in your crest</p>
            <div className="flex flex-wrap gap-2">{fromLogo.map((h) => swatch(h, `Crest colour ${h}`))}</div>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Suggestions</p>
          <div className="flex flex-wrap gap-2">{PRESETS.map((p, i) => swatch(p.hex, p.name, i === 0 ? "" : p.hex))}</div>
        </div>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          Any colour
          <input type="color" value={isHex(value) ? value : "#1d4ed8"} onChange={(e) => setValue(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
          <span className="font-mono text-xs text-slate-500">{value || "default blue"}</span>
        </label>
        <p className="text-xs text-slate-500">The system makes lighter and darker shades from the colour you pick, so text stays easy to read whatever colour you choose.</p>
      </div>
      <div aria-label="Preview" className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-sm">
        <div className="flex">
          <div className="w-32 space-y-1 p-2.5" style={{ background: s[900] }}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: s[300] }}>Academics</p>
            <p className="rounded px-2 py-1 font-medium text-white" style={{ background: "rgba(255,255,255,0.15)" }}>Dashboard</p>
            <p className="px-2 py-1" style={{ color: s[100] }}>Students</p>
            <p className="px-2 py-1" style={{ color: s[100] }}>Report Cards</p>
          </div>
          <div className="flex-1 space-y-3 p-3">
            <p className="font-semibold text-slate-900">Preview</p>
            <span className="inline-block rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: s[700] }}>Save marks</span>
            <p className="text-xs"><span className="underline" style={{ color: s[700] }}>Readiness</span> · <span className="underline" style={{ color: s[700] }}>Who is missing?</span></p>
            <p className="rounded px-2 py-1 text-xs" style={{ background: s[50], color: s[800] }}>Highlighted row</p>
          </div>
        </div>
      </div>
    </div>
  );
}
