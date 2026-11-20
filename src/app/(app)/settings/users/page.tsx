import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { adminResetPassword, createUser, setUserActive, updateUserRoles } from "@/server/actions/settings";
import { CheckboxField, ConfirmAction, FormDialog, Grid, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Badge, StatusBadge } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDateTime } from "@/lib/utils";

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePage("users.manage");
  const params = await searchParams;
  const q = sp(params, "q");
  const role = sp(params, "role");
  const status = sp(params, "status");
  const { page, pageSize, skip, take } = pageParams(params);
  const where = {
    AND: [
      q ? { OR: [{ username: { contains: q, mode: "insensitive" as const } }, { fullName: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {},
      role ? { roles: { some: { role: { code: role } } } } : {},
      status ? { isActive: status === "ACTIVE" } : {},
    ],
  };
  const [users, total, roles] = await Promise.all([
    prisma.user.findMany({ where, include: { roles: { include: { role: true } } }, orderBy: { fullName: "asc" }, skip, take }),
    prisma.user.count({ where }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  const grantable = roles.filter((r) => r.code !== "ADMIN" || me.roles.includes("ADMIN"));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Staff accounts are created here. Parent and student portal accounts are created from the guardian and student pages.</p>
        <FormDialog trigger="New user" title="New user account" action={createUser} wide>
          <Grid>
            <TextField label="Username" name="username" required hint="Used to sign in" />
            <TextField label="Full name" name="fullName" required />
            <TextField label="Email" name="email" type="email" hint="Needed for self-service password reset" />
            <TextField label="Phone" name="phone" />
          </Grid>
          <RolePicker roles={grantable} />
          <Grid>
            <TextField label="Password" name="password" autoComplete="off" hint="Type one (8+ characters, letters and numbers), or leave empty to generate a temporary password shown once." />
          </Grid>
          <CheckboxField name="mustChange" label="Must change the password at first sign-in (recommended)" defaultChecked />
        </FormDialog>
      </div>
      <FilterBar
        searchPlaceholder="Search name, username or email"
        filters={[
          { name: "role", label: "Role", options: roles.map((r) => ({ value: r.code, label: r.name })) },
          { name: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }] },
        ]}
      />
      <Table>
        <THead><tr><TH>Name</TH><TH>Username</TH><TH>Roles</TH><TH>Status</TH><TH>Last sign-in</TH><TH /></tr></THead>
        <tbody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">{u.fullName}<p className="text-xs font-normal text-slate-500">{u.email}</p></TD>
              <TD>{u.username}</TD>
              <TD><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.roleId} color="blue">{r.role.name}</Badge>)}</div></TD>
              <TD><StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} /></TD>
              <TD className="whitespace-nowrap text-xs">{fmtDateTime(u.lastLoginAt)}</TD>
              <TD>
                <div className="flex flex-wrap justify-end gap-1">
                  <FormDialog trigger="Edit" title={`Edit ${u.username}`} action={updateUserRoles} triggerVariant="outline" triggerSize="sm" wide>
                    <input type="hidden" name="userId" value={u.id} />
                    <Grid>
                      <TextField label="Full name" name="fullName" defaultValue={u.fullName} required />
                      <TextField label="Email" name="email" type="email" defaultValue={u.email ?? ""} />
                      <TextField label="Phone" name="phone" defaultValue={u.phone ?? ""} />
                    </Grid>
                    <RolePicker roles={grantable} selected={u.roles.map((r) => r.roleId)} />
                  </FormDialog>
                  <FormDialog trigger="Set password" title={`New password for ${u.username}`} action={adminResetPassword} triggerVariant="outline" triggerSize="sm">
                    <input type="hidden" name="userId" value={u.id} />
                    <TextField label="New password" name="password" autoComplete="off" hint="Type a password (8+ characters, letters and numbers), or leave empty to generate a temporary one." />
                    <CheckboxField name="mustChange" label="Must change it at next sign-in (recommended)" defaultChecked />
                  </FormDialog>
                  {u.id !== me.id && (
                    <ConfirmAction
                      action={setUserActive}
                      fields={{ userId: u.id, active: u.isActive ? "false" : "true" }}
                      label={u.isActive ? "Deactivate" : "Activate"}
                      variant={u.isActive ? "destructive" : "success"}
                      confirm={u.isActive ? `Deactivate ${u.username}? They will be signed out immediately.` : undefined}
                    />
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination base="/settings/users" params={params} total={total} page={page} pageSize={pageSize} />
    </>
  );
}

function RolePicker({ roles, selected = [] }: { roles: { id: string; name: string; description: string | null }[]; selected?: string[] }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">Roles <span className="text-red-600">*</span></legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {roles.map((r) => (
          <label key={r.id} className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm">
            <input type="checkbox" name="roleIds[]" value={r.id} defaultChecked={selected.includes(r.id)} className="mt-0.5" />
            <span>{r.name}<span className="block text-xs text-slate-500">{r.description}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
