import { requirePage } from "@/server/auth";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BackupPage() {
  await requirePage("backup.manage");
  return (
    <Card>
      <CardHeader><CardTitle>Backups & recovery</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <Alert tone="info">
          Production backups are taken by the managed PostgreSQL provider (daily snapshots plus point-in-time recovery). In addition, the <code>scripts/backup.sh</code> job
          writes an encrypted <code>pg_dump</code> to off-site object storage every night. See <code>docs/BACKUP_AND_RECOVERY.md</code>.
        </Alert>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Daily automatic backups are retained for at least 7 days (30 days recommended).</li>
          <li>A monthly restore test must be done into a staging database and recorded.</li>
          <li>Restores into production need written approval from the Headteacher.</li>
        </ol>
        <p>
          Download a full data export (all tables as JSON, gzipped) for off-line safekeeping: <a className="text-brand-700 underline" href="/api/backup">Download data export</a>. Each download is recorded in the audit log. Store it securely: it contains personal data.
        </p>
      </CardContent>
    </Card>
  );
}
