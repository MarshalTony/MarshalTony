// Always render on request: the school name/logo/colour come from the database and can change.
export const dynamic = "force-dynamic";

import { getSchool } from "@/server/school";
import { SchoolLogo } from "@/components/logo";
import { ThemeStyle } from "@/components/theme-style";

/** Sign-in and password pages: the school's crest, name and motto on its own colour, with the form beside it. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const school = await getSchool();
  // Postal address and email from the school profile (Settings → School profile).
  const postal = [school.poBox, school.address].filter(Boolean).join(", ");
  // Help with signing in comes from the system administrator (Settings → School profile → Support contact), not the school office lines.
  const tel = school.supportPhone?.replace(/[^\d+]/g, "");
  const support = school.supportPhone ? (
    <>Need help signing in? Contact {school.supportName || "the system administrator"}: <a href={`tel:${tel}`} className="font-medium underline">{school.supportPhone}</a></>
  ) : null;
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <ThemeStyle />
      <section className="relative overflow-hidden bg-brand-900 px-6 py-8 text-white lg:flex lg:w-[44%] lg:flex-col lg:justify-center lg:px-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-700/40" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-brand-800/60" />
        <div className="relative flex items-center gap-4 lg:flex-col lg:items-start lg:gap-6">
          <div className="lg:hidden"><SchoolLogo fileId={school.logoFileId} size={64} tile /></div>
          <div className="hidden lg:block"><SchoolLogo fileId={school.logoFileId} size={120} tile /></div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight lg:text-3xl">{school.name}</h1>
            {school.motto && <p className="mt-1 text-sm italic text-brand-100 lg:mt-3 lg:text-base">&ldquo;{school.motto}&rdquo;</p>}
            <p className="mt-2 hidden text-sm text-brand-200 lg:block">School Management Information System</p>
          </div>
        </div>
        {(postal || school.email) && (
          <div className="relative mt-10 hidden space-y-1 text-sm text-brand-100 lg:block">
            {postal && <p>{postal}</p>}
            {school.email && <p>Email: <a href={`mailto:${school.email}`} className="underline">{school.email}</a></p>}
          </div>
        )}
      </section>
      <main className="flex flex-1 items-start justify-center px-4 py-8 lg:items-center lg:py-10">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
          {support && <p className="mt-6 text-center text-sm text-slate-600">{support}</p>}
          {(postal || school.email) && (
            <p className="mt-3 text-center text-xs text-slate-500 lg:hidden">
              {postal}{postal && school.email ? " · " : ""}{school.email && <a href={`mailto:${school.email}`} className="underline">{school.email}</a>}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
