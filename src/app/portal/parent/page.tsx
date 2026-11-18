import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePortal } from "@/server/portal";
import { balancesFor } from "@/server/queries/fees";
import { PortalNotices } from "@/components/portal-notices";
import { Card, CardContent } from "@/components/ui/card";
import { ordinal, studentName, ugx } from "@/lib/utils";

export const metadata = { title: "Parent portal" };

export default async function ParentHome() {
  const user = await requirePortal("parent");
  const links = await prisma.studentGuardian.findMany({
    where: { guardianId: user.guardianId! },
    include: { student: { include: { schoolClass: true, stream: true, examResults: { where: { exam: { status: "PUBLISHED" } }, orderBy: { computedAt: "desc" }, take: 1, include: { exam: true } } } } },
  });
  const balances = await balancesFor(links.map((l) => l.studentId));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-slate-500">{links.length} child{links.length === 1 ? "" : "ren"} linked to your account.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => {
          const r = l.student.examResults[0];
          const bal = balances.get(l.studentId) ?? 0;
          return (
            <Link key={l.studentId} href={`/portal/parent/child/${l.studentId}`}>
              <Card className="transition hover:border-brand-400 hover:shadow">
                <CardContent>
                  <p className="text-lg font-semibold text-brand-900">{studentName(l.student)}</p>
                  <p className="text-sm text-slate-500">{l.student.admissionNo} · {l.student.schoolClass.name} {l.student.stream.name}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs uppercase text-slate-500">Fees balance</p><p className={`font-semibold ${bal > 0 ? "text-red-700" : "text-emerald-700"}`}>{ugx(bal)}</p></div>
                    <div><p className="text-xs uppercase text-slate-500">Latest result</p><p className="font-semibold">{r ? `${Number(r.average).toFixed(1)}% · ${ordinal(r.classPosition)}` : "—"}</p></div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {links.length === 0 && <p className="text-sm text-slate-500">No children are linked to your account yet. Please contact the school office.</p>}
      <PortalNotices user={user} classIds={links.map((l) => l.student.classId)} />
    </div>
  );
}
