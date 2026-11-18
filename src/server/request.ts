import { headers } from "next/headers";

export async function clientInfo() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip")) || "unknown";
  const userAgent = (h.get("user-agent") || "").slice(0, 300);
  return { ip, userAgent };
}
