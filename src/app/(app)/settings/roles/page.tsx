import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { saveRole } from "@/server/actions/settings";
import { FormDialog, Grid, TextField } from "@/components/forms";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RolesPage() {
  await requirePage("roles.manage");
  const [roles, perms] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" }, include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] }),
  ]);
  const modules = [...new Set(perms.map((p) => p.module))];
  const picker = (selected: string[]) => (
    <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded border border-slate-200 p-3">
      {modules.map((m) => (
        <div key={m}>
          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{m}</p>
          {perms.filter((p) => p.module === m).map((p) => (
            <label key={p.code} className="flex items-start gap-2 py-0.5 text-sm">
              <input type="checkbox" name="permissions[]" value={p.code} defaultChecked={selected.includes(p.code)} className="mt-0.5" />
              <span><code className="text-xs text-brand-800">{p.code}</code> — {p.description}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div className="space-y-4">
      <FormDialog trigger="New role" title="New role" action={saveRole} wide>
        <Grid><TextField label="Code" name="code" placeholder="MATRON" required /><TextField label="Name" name="name" required /></Grid>
        <TextField label="Description" name="description" />
        {picker([])}
      </FormDialog>
      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((r) => {
          const codes = r.permissions.map((p) => p.permission.code);
          return (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle>{r.name} <span className="text-xs font-normal text-slate-500">({r.code} · {r._count.users} users)</span></CardTitle>
                {r.code !== "ADMIN" && (
                  <FormDialog trigger="Edit permissions" title={`Edit ${r.name}`} action={saveRole} triggerVariant="outline" triggerSize="sm" wide>
                    <input type="hidden" name="id" value={r.id} />
                    <TextField label="Name" name="name" defaultValue={r.name} required />
                    <TextField label="Description" name="description" defaultValue={r.description ?? ""} />
                    {picker(codes)}
                  </FormDialog>
                )}
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-sm text-slate-600">{r.description}</p>
                <div className="flex flex-wrap gap-1">{codes.sort().map((c) => <Badge key={c}>{c}</Badge>)}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
