import { requirePage } from "@/server/auth";
import { PageHeader } from "@/components/ui/card";

export default async function Dashboard() {
  const user = await requirePage();
  return <PageHeader title={`Welcome, ${user.fullName}`} description="Dashboard" />;
}
