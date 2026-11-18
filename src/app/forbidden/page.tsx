import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <ShieldAlert className="h-12 w-12 text-red-500" />
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="max-w-md text-sm text-slate-500">Your account does not have permission to open this page. If you believe this is a mistake, contact the system administrator.</p>
      <Link href="/" className="text-brand-700 hover:underline">Go to my home page</Link>
    </div>
  );
}
