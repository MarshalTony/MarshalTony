import Link from "next/link";
import type { ResultsReadiness } from "@/server/exams/readiness";
import { Alert } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/utils";

const STATUS: Record<string, string> = { DRAFT: "not submitted", SUBMITTED: "awaiting approval", REJECTED: "returned to teacher" };

/** Warns when marks entered by teachers are not (yet) in the generated results that report cards print from. */
export function ResultsReadinessAlert({ r, examHref }: { r: ResultsReadiness; examHref?: string }) {
  const pending = r.provisional ? [] : r.pending;
  if (!r.stale && pending.length === 0) return null;
  const shown = pending.slice(0, 8);
  return (
    <Alert tone="warn" className="mb-3 space-y-1">
      <p className="font-medium">Report cards may not show all end-of-term marks yet.</p>
      {r.stale && (
        <p>Marks were entered or changed {r.lastMarkAt ? `on ${fmtDateTime(r.lastMarkAt)} ` : ""}after results were {r.generatedAt ? `last generated (${fmtDateTime(r.generatedAt)})` : "generated"}. <b>Generate results</b> again to include them.</p>
      )}
      {pending.length > 0 && (
        <>
          <p>{pending.length} mark sheet{pending.length === 1 ? " is" : "s are"} not approved, so {pending.length === 1 ? "its" : "their"} marks are left out of results: approve them (teachers submit, then the DOS approves), or tick <i>Include marks not yet approved (provisional)</i> when generating.</p>
          <ul className="list-disc pl-5 text-xs">
            {shown.map((p) => <li key={p.stream + p.subject}>{p.stream} — {p.subject}: {STATUS[p.status] ?? p.status.toLowerCase()}</li>)}
            {pending.length > shown.length && <li>…and {pending.length - shown.length} more</li>}
          </ul>
        </>
      )}
      {examHref && <p><Link className="underline" href={examHref}>Open the examination to approve and generate results</Link></p>}
    </Alert>
  );
}
