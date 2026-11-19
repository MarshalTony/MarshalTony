import { prisma } from "@/lib/db";
import { requirePage, can } from "@/server/auth";
import { saveCommentTemplate, deleteCommentTemplate } from "@/server/actions/comment-bank";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextAreaField, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { COMMENT_ROLES } from "@/lib/comment-bank";

export const metadata = { title: "Comment bank" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** Ready-made report-card comments by role and score range. Used by "Fill empty comments" and the ↻ suggestions. */
export default async function CommentBankPage() {
  const user = await requirePage("reports.comment.class", "reports.comment.dos", "reports.comment.head", "settings.manage");
  const edit = can(user, "settings.manage", "reports.comment.head", "reports.comment.dos");
  const all = await prisma.commentTemplate.findMany({ orderBy: [{ role: "asc" }, { minScore: "desc" }, { createdAt: "asc" }] });

  const form = (t?: (typeof all)[number]) => (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <SelectField label="For" name="role" required defaultValue={t?.role ?? "CLASS_TEACHER"} options={COMMENT_ROLES.map((r) => ({ value: r.value, label: r.label }))} />
      <Grid>
        <TextField label="From score (%)" name="minScore" type="number" step="0.01" min={0} max={100} required defaultValue={t ? Number(t.minScore) : 80} />
        <TextField label="To score (%)" name="maxScore" type="number" step="0.01" min={0} max={100} required defaultValue={t ? Number(t.maxScore) : 89.99} />
      </Grid>
      <TextAreaField label="Comment" name="text" required rows={3} maxLength={500} defaultValue={t?.text ?? ""} hint="{name} is replaced with the student's first name, e.g. “Very good work, {name}. Keep it up.”" />
      <CheckboxField name="isActive" label="In use" defaultChecked={t ? t.isActive : true} />
    </>
  );

  return (
    <>
      <PageHeader
        title="Comment bank"
        description="Ready-made report-card comments. Each applies to a score range (the student's average, or for O-Level end-of-term cards the average of subject totals). When several match, they are used in turn so classmates do not all get the same sentence."
        actions={edit ? <FormDialog trigger="Add comment" title="New comment" action={saveCommentTemplate}>{form()}</FormDialog> : null}
      />
      <div className="space-y-5">
        {COMMENT_ROLES.map((role) => {
          const list = all.filter((t) => t.role === role.value);
          return (
            <Card key={role.value}>
              <CardHeader><CardTitle>{role.label} ({list.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>Score range</TH><TH>Comment</TH><TH>Status</TH>{edit && <TH />}</tr></THead>
                  <tbody>
                    {list.map((t) => (
                      <TR key={t.id}>
                        <TD className="whitespace-nowrap font-medium">{fmt(Number(t.minScore))} – {fmt(Number(t.maxScore))}%</TD>
                        <TD>{t.text}</TD>
                        <TD>{t.isActive ? <Badge color="green">In use</Badge> : <Badge>Off</Badge>}</TD>
                        {edit && (
                          <TD className="whitespace-nowrap text-right">
                            <FormDialog trigger="Edit" title="Edit comment" action={saveCommentTemplate} triggerVariant="ghost" triggerSize="sm">{form(t)}</FormDialog>
                            <ConfirmAction action={deleteCommentTemplate} fields={{ id: t.id }} label="Delete" variant="ghost" confirm="Delete this comment from the bank? Comments already written on report cards are not affected." />
                          </TD>
                        )}
                      </TR>
                    ))}
                    {list.length === 0 && <TR><TD colSpan={4} className="py-4 text-center text-slate-500">No comments yet.</TD></TR>}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
