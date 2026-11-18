// Always render on request: the school name/logo come from the database and can change.
export const dynamic = "force-dynamic";

import { getSchool } from "@/server/school";
import { SchoolLogo } from "@/components/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const school = await getSchool();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <SchoolLogo fileId={school.logoFileId} size={64} />
          <h1 className="mt-3 text-xl font-semibold text-brand-900">{school.name}</h1>
          <p className="text-sm text-slate-500">School Management Information System</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-slate-500">
          {school.phone} · {school.email}
        </p>
      </div>
    </div>
  );
}
