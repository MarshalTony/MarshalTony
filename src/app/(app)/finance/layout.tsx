import { requirePage } from "@/server/auth";
import { Tabs } from "@/components/tabs";
import { PageHeader } from "@/components/ui/card";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requirePage("finance.view", "finance.manage");
  return (
    <>
      <PageHeader title="Accounts & expenditure" description="Cash-basis accounts. Vouchers are approved before payment; nothing is deleted — rejected or voided items stay on record." />
      <Tabs tabs={[
        { href: "/finance", label: "Summary" }, { href: "/finance/expenses", label: "Expenses & vouchers" }, { href: "/finance/income", label: "Other income" },
        { href: "/finance/purchase-orders", label: "Purchase orders" }, { href: "/finance/suppliers", label: "Suppliers" },
        { href: "/finance/petty-cash", label: "Petty cash" }, { href: "/finance/budgets", label: "Budgets" },
      ]} />
      {children}
    </>
  );
}
