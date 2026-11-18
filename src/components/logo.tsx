/* eslint-disable @next/next/no-img-element */
export function SchoolLogo({ fileId, size = 40 }: { fileId?: string | null; size?: number }) {
  if (fileId) return <img src={`/api/files/${fileId}`} alt="School logo" width={size} height={size} className="rounded-md object-contain" style={{ width: size, height: size }} />;
  return (
    <div className="flex items-center justify-center rounded-md bg-brand-700 font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      BO
    </div>
  );
}
