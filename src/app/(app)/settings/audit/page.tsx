import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { FilterBar } from "@/components/filters";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDateTime } from "@/lib/utils";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("audit.view");
  const params = await searchParams;
  const q = sp(params, "q");
  const entity = sp(params, "entity");
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const where = {
    AND: [
      entity ? { entity } : {},
      q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { entityId: q }, { user: { username: { contains: q, mode: "insensitive" as const } } }] } : {},
    ],
  };
  const [logs, total, entities, logins] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: { select: { username: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.loginHistory.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
        <CardContent>
          <FilterBar searchPlaceholder="Action, record id or username" filters={[{ name: "entity", label: "Record type", options: entities.map((e) => ({ value: e.entity, label: e.entity })) }]} />
          <Table>
            <THead><tr><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Record</TH><TH>Details</TH><TH>IP</TH></tr></THead>
            <tbody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TD>
                  <TD>{l.user?.username ?? "system"}</TD>
                  <TD className="font-medium">{l.action}</TD>
                  <TD className="text-xs">{l.entity}<br /><span className="text-slate-400">{l.entityId}</span></TD>
                  <TD><code className="block max-w-md truncate text-xs text-slate-500" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ""}</code></TD>
                  <TD className="text-xs">{l.ip}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination base="/settings/audit" params={params} total={total} page={page} pageSize={pageSize} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent sign-in attempts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><tr><TH>When</TH><TH>Username</TH><TH>Result</TH><TH>IP</TH><TH>Device</TH></tr></THead>
            <tbody>
              {logins.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TD>
                  <TD>{l.username}</TD>
                  <TD>{l.success ? <StatusBadge status="APPROVED" /> : <StatusBadge status={l.reason === "RATE_LIMITED" ? "SUSPENDED" : "FAILED"} />} <span className="text-xs text-slate-500">{l.reason}</span></TD>
                  <TD className="text-xs">{l.ip}</TD>
                  <TD className="max-w-xs truncate text-xs text-slate-500">{l.userAgent}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
