import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { sendBulkMessage } from "@/server/actions/communication";
import { channelConfigured } from "@/server/messaging";
import { ActionForm, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { classTree, classOptions, streamOptions } from "@/server/queries/lookups";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("communication.send");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const where = { ...(sp(params, "status") ? { status: sp(params, "status") } : {}), ...(sp(params, "channel") ? { channel: sp(params, "channel") } : {}) };
  const [tree, rows, total, templates] = await Promise.all([
    classTree(),
    prisma.outboundMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.outboundMessage.count({ where }),
    prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);
  const cfg = { SMS: channelConfigured("SMS"), EMAIL: channelConfigured("EMAIL"), WHATSAPP: channelConfigured("WHATSAPP") };
  return (
    <>
      <PageHeader title="SMS, email & WhatsApp" description="Messages to parents and staff. Every attempt and its delivery status is recorded below." />
      {!cfg.SMS && !cfg.EMAIL && !cfg.WHATSAPP && (
        <Alert tone="warn" className="mb-4">
          No messaging provider is configured yet, so messages are recorded with status NOT CONFIGURED and are not delivered. The administrator must add
          Africa&apos;s Talking (SMS), SMTP (email) or WhatsApp Cloud API credentials — see docs/EXTERNAL_SERVICES.md.
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeader><CardTitle>Send a message</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={sendBulkMessage} submitLabel="Send" confirmText="Send this message to all selected recipients?">
              <Grid>
                <SelectField label="Channel" name="channel" options={(["SMS", "EMAIL", "WHATSAPP"] as const).map((c) => ({ value: c, label: `${c}${cfg[c] ? "" : " (not configured)"}` }))} />
                <SelectField label="Category" name="category" options={["GENERAL", "EMERGENCY", "EXAM", "FEES", "ATTENDANCE", "EVENT"].map((c) => ({ value: c, label: c }))} />
              </Grid>
              <SelectField label="Recipients" name="recipients" options={[
                { value: "ALL_GUARDIANS", label: "All parents (primary contacts)" }, { value: "CLASS_GUARDIANS", label: "Parents of a class" },
                { value: "STREAM_GUARDIANS", label: "Parents of a stream" }, { value: "STAFF", label: "All staff" },
              ]} />
              <Grid>
                <SelectField label="Class" name="classId" placeholder="—" options={classOptions(tree)} />
                <SelectField label="Stream" name="streamId" placeholder="—" options={streamOptions(tree)} />
              </Grid>
              <TextField label="Email subject" name="subject" />
              <TextAreaField label="Message" name="body" rows={5} required hint="{{guardian}} and {{student}} are replaced per recipient. 160 characters = 1 SMS." />
            </ActionForm>
            <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">Templates</summary>{templates.map((t) => <p key={t.id} className="mt-1"><b>{t.name}:</b> {t.body}</p>)}</details>
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <FilterBar filters={[
            { name: "channel", label: "Channel", options: ["SMS", "EMAIL", "WHATSAPP"].map((c) => ({ value: c, label: c })) },
            { name: "status", label: "Status", options: ["SENT", "FAILED", "NOT_CONFIGURED", "QUEUED"].map((c) => ({ value: c, label: c })) },
          ]} />
          <Table>
            <THead><tr><TH>When</TH><TH>To</TH><TH>Channel</TH><TH>Message</TH><TH>Status</TH></tr></THead>
            <tbody>
              {rows.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</TD>
                  <TD className="text-xs">{m.recipientName}<br />{m.recipient}</TD>
                  <TD className="text-xs">{m.channel}<br />{m.category}</TD>
                  <TD className="max-w-xs text-xs"><span className="block truncate" title={m.body}>{m.body}</span></TD>
                  <TD><StatusBadge status={m.status} />{m.error && <p className="max-w-[160px] truncate text-xs text-red-600" title={m.error}>{m.error}</p>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination base="/messages" params={params} total={total} page={page} pageSize={pageSize} />
        </div>
      </div>
    </>
  );
}
