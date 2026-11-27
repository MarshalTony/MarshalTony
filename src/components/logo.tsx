/* eslint-disable @next/next/no-img-element */
/**
 * The school crest (Settings → School profile → Logo), or a "BO" badge until one is uploaded.
 * `tile` puts it on a white rounded tile so a crest with a white background looks right on the coloured menu bar.
 */
export function SchoolLogo({ fileId, size = 40, tile }: { fileId?: string | null; size?: number; tile?: boolean }) {
  if (fileId) {
    const img = <img src={`/api/files/${fileId}`} alt="School crest" width={size} height={size} className="rounded-md object-contain" style={{ width: tile ? size - 6 : size, height: tile ? size - 6 : size }} />;
    return tile ? <div className="flex shrink-0 items-center justify-center rounded-lg bg-white shadow-sm" style={{ width: size, height: size }}>{img}</div> : img;
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-md font-bold ${tile ? "bg-white text-brand-800" : "bg-brand-700 text-white"}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      BO
    </div>
  );
}
