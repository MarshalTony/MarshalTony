import { requirePage } from "@/server/auth";
import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui/card";

export default async function AcademicsLayout({ children }: { children: React.ReactNode }) {
  await requirePage("academics.view");
  return (
    <>
      <PageHeader title="Classes & subjects" description="Subjects, A-Level combinations and teacher allocations. Classes and streams are set up in Settings." />
      <Tabs tabs={[{ href: "/academics", label: "Subjects & combinations" }, { href: "/academics/grid", label: "Allocation grid" }, { href: "/academics/allocations", label: "Teacher allocations (list)" }]} />
      {children}
    </>
  );
}
