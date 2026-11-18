import Link from "next/link";
import { requirePortal, childOf } from "@/server/portal";
import { PortalStudentView } from "@/components/portal-student-view";

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortal("parent");
  const { id } = await params;
  await childOf(user, id);
  return (
    <>
      <Link href="/portal/parent" className="mb-4 inline-block text-sm text-brand-700 hover:underline">← All my children</Link>
      <PortalStudentView studentId={id} />
    </>
  );
}
