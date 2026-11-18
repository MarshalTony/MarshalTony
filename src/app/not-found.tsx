import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-500">The record or page you requested does not exist.</p>
      <Link href="/" className="text-brand-700 hover:underline">Go home</Link>
    </div>
  );
}
