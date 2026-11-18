"use client";
/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { resizeImage } from "@/lib/resize-image";
import type { ActionResult } from "@/server/action";

type Student = { id: string; admissionNo: string; name: string; stream: string; photoFileId: string | null };
type Act = (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Letters and digits only, upper-case: "BOHS/2026/0021" and "bohs-2026-0021.jpg" both become "BOHS20260021". */
const norm = (s: string) => s.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]/gi, "").toUpperCase();

export function PhotoGrid({ students, setPhoto, removePhoto }: { students: Student[]; setPhoto: Act; removePhoto: Act }) {
  const router = useRouter();
  const [photos, setPhotos] = React.useState(() => Object.fromEntries(students.map((s) => [s.id, s.photoFileId])));
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [batch, setBatch] = React.useState<{ done: number; total: number } | null>(null);
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  const target = React.useRef<string | null>(null);
  const single = React.useRef<HTMLInputElement>(null);
  const many = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setPhotos(Object.fromEntries(students.map((s) => [s.id, s.photoFileId]))), [students]);

  const mark = (id: string, on: boolean) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });

  async function upload(student: Student, file: File): Promise<boolean> {
    mark(student.id, true);
    try {
      const { file: small } = await resizeImage(file, 800);
      const fd = new FormData();
      fd.set("id", student.id);
      fd.set("photo", small);
      const r = await setPhoto(null, fd);
      if (!r.ok) { toast.error(`${student.name}: ${r.error ?? "could not save"}`); return false; }
      setPhotos((p) => ({ ...p, [student.id]: (r.data as { fileId: string }).fileId }));
      return true;
    } catch {
      toast.error(`${student.name}: this picture could not be read. Use a JPG or PNG photo.`);
      return false;
    } finally {
      mark(student.id, false);
    }
  }

  async function onSingle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const s = students.find((x) => x.id === target.current);
    e.target.value = "";
    if (!file || !s) return;
    if (await upload(s, file)) { toast.success(`Photo saved for ${s.name}.`); router.refresh(); }
  }

  async function onMany(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    const byAdm = new Map(students.map((s) => [norm(s.admissionNo), s]));
    const pairs = files.map((f) => ({ f, s: byAdm.get(norm(f.name)) }));
    const matched = pairs.filter((p) => p.s) as { f: File; s: Student }[];
    setUnmatched(pairs.filter((p) => !p.s).map((p) => p.f.name));
    if (!matched.length) { toast.error("No file name matched an admission number in this list."); return; }
    setBatch({ done: 0, total: matched.length });
    let ok = 0;
    for (const [i, p] of matched.entries()) { // one at a time: small requests, works on slow connections
      if (await upload(p.s, p.f)) ok++;
      setBatch({ done: i + 1, total: matched.length });
    }
    setBatch(null);
    toast.success(`${ok} of ${matched.length} photo(s) saved.`);
    router.refresh();
  }

  async function remove(s: Student) {
    if (!confirm(`Remove the photo of ${s.name}?`)) return;
    const fd = new FormData(); fd.set("id", s.id);
    const r = await removePhoto(null, fd);
    if (!r.ok) { toast.error(r.error ?? "Could not remove."); return; }
    setPhotos((p) => ({ ...p, [s.id]: null }));
    router.refresh();
  }

  const have = students.filter((s) => photos[s.id]).length;
  return (
    <div className="space-y-3">
      <input ref={single} type="file" accept="image/*" className="hidden" onChange={onSingle} aria-label="Choose photo" />
      <input ref={many} type="file" accept="image/*" multiple className="hidden" onChange={onMany} aria-label="Choose many photos" />
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <span><b>{have}</b> of {students.length} have photos</span>
        <div className="h-2 w-40 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${students.length ? (have / students.length) * 100 : 0}%` }} /></div>
        <span className="ml-auto flex items-center gap-2">
          {batch && <span className="flex items-center gap-1 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Uploading {batch.done}/{batch.total}…</span>}
          <Button type="button" variant="outline" size="sm" disabled={!!batch} onClick={() => many.current?.click()}><Upload />Upload many (named by admission no.)</Button>
        </span>
      </div>
      {unmatched.length > 0 && (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          Not matched to a student in this list ({unmatched.length}): {unmatched.slice(0, 12).join(", ")}{unmatched.length > 12 ? "…" : ""}. Name each file with the admission number, e.g. <code>BOHS-2026-0021.jpg</code>.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {students.map((s) => {
          const pid = photos[s.id];
          const loading = busy.has(s.id);
          return (
            <div key={s.id} className={`group relative overflow-hidden rounded-lg border bg-white ${pid ? "border-slate-200" : "border-dashed border-amber-300"}`}>
              <button
                type="button"
                className="block w-full text-left"
                disabled={loading || !!batch}
                onClick={() => { target.current = s.id; single.current?.click(); }}
                aria-label={`${pid ? "Change" : "Add"} photo for ${s.name}`}
                title={`${pid ? "Change" : "Add"} photo`}
              >
                <div className="relative aspect-[4/5] w-full bg-slate-50">
                  {pid ? <img src={`/api/files/${pid}`} alt={s.name} loading="lazy" className="h-full w-full object-cover" /> : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400"><Camera className="h-8 w-8" /><span className="text-xs">Add photo</span></div>
                  )}
                  {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-brand-700" /></div>}
                  {pid && !loading && <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs text-white opacity-0 transition group-hover:opacity-100">Change photo</span>}
                </div>
                <div className="p-2">
                  <div className="truncate text-sm font-medium" title={s.name}>{s.name}</div>
                  <div className="truncate font-mono text-[11px] text-slate-500">{s.admissionNo} · {s.stream}</div>
                </div>
              </button>
              {pid && !loading && (
                <button type="button" onClick={() => remove(s)} className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-600 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100" aria-label={`Remove photo of ${s.name}`} title="Remove photo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
