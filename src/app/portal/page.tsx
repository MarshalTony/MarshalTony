import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/server/auth";

export default async function PortalIndex() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.roles) : "/login");
}
