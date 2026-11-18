import { requirePage, can } from "@/server/auth";
import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui/card";

export default async function FeesLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage("fees.view", "fees.collect");
  const tabs = [
    { href: "/fees", label: "Overview" },
    { href: "/fees/students", label: "Student accounts" },
    { href: "/fees/payments", label: "Payments" },
    ...(can(user, "fees.view") ? [{ href: "/fees/structures", label: "Fee structures" }] : []),
  ];
  return (
    <>
      <PageHeader title="School fees" description="All amounts in UGX. Completed transactions are never edited or deleted — corrections use reversals and adjustments." />
      <Tabs tabs={tabs} />
      {children}
    </>
  );
}
