import { redirect } from "next/navigation";
import type { SP } from "@/components/data-table";

/** Old address: activity scores now live under Academics → Enter Scores. */
export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const q = new URLSearchParams({ type: "activity" });
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && ["termId", "streamId", "subjectId"].includes(k)) q.set(k, v);
  redirect(`/scores?${q}`);
}
