import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { bulkCreateStaffAccounts, createStaffAccount } from "@/server/actions/staff";
import { adminResetPassword, setUserActive } from "@/server/actions/settings";
import { usernameBase } from "@/server/users";
import { CheckboxField, ConfirmAction, FormDialog, SelectField, TextField } from "@/components/forms";
import { ScorePicker } from "@/components/score-picker";
import { Button } from "@/components/ui/button";
import { Alert, Badge, PageHeader, StatCard, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD, sp, type SP } from "@/components/data-table";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Staff logins" };

const PW_HINT = "At least 8 characters with letters and numbers, e.g. Ogez2026. Tell the staff member in person.";

/** Staff logins: who can sign in, create logins one by one or for everyone, and set passwords. */
export default async function StaffLoginsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePage("users.manage");
  const show = sp(await searchParams, "show");
  const [staff, roles] = await Promise.all([
    prisma.staff.findMany({
      where: { status: { not: "EXITED" } },
      include: { user: { include: { roles: { include: { role: true } } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.role.findMany({ where: { code: { notIn: ["PARENT", "STUDENT"] } }, orderBy: { name: "asc" } }),
  ]);
  const grantable = roles.filter((r) => r.code !== "ADMIN" || me.roles.includes("ADMIN"));
  const teacherRole = roles.find((r) => r.code === "TEACHER");
  const without = staff.filter((s) => !s.user);
  const pending = staff.filter((s) => s.user?.mustChangePassword);
  const list = show === "none" ? without : show === "has" ? staff.filter((s) => s.user) : show === "change" ? pending : staff;

  const rolePicker = (preTeacher: boolean) => (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Roles (what this person can open)</legend>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {grantable.map((r) => <label key={r.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="roleIds[]" value={r.id} defaultChecked={preTeacher && r.code === "TEACHER"} />{r.name}</label>)}
      </div>
    </fieldset>
  );

  return (
    <>
      <PageHeader
        title="Staff logins"
        description="Give staff a username and password. You choose the password; by default they must change it the first time they sign in, and can change it any time with the key icon at the top."
        actions={<>
          {without.length > 0 && (
            <FormDialog trigger={`Create logins for everyone without one (${without.length})`} title="Create logins in one go" action={bulkCreateStaffAccounts} wide>
              <Alert>Usernames are made from each name as <b>first.last</b> (e.g. <i>peter.okello</i>; a number is added if two people share a name). Everyone gets the same starting password you type below.</Alert>
              <SelectField label="Who" name="scope" defaultValue="TEACHING" options={[{ value: "TEACHING", label: `Teaching staff without a login (${without.filter((s) => s.isTeaching).length})` }, { value: "ALL", label: `All staff without a login (${without.length})` }]} />
              <SelectField label="Role" name="roleId" required defaultValue={teacherRole?.id} options={grantable.filter((r) => r.code !== "ADMIN").map((r) => ({ value: r.id, label: r.name }))} hint="Add more roles (class teacher, bursar, DOS…) person by person afterwards in Settings → Users." />
              <TextField label="Starting password" name="password" required autoComplete="off" hint={PW_HINT} />
              <CheckboxField name="mustChange" label="Must change the password at first sign-in (recommended)" defaultChecked />
            </FormDialog>
          )}
          <Button asChild variant="outline"><Link href="/settings/users">Settings → Users</Link></Button>
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff" value={staff.length} />
        <StatCard label="With a login" value={staff.length - without.length} />
        <StatCard label="Without a login" value={without.length} />
        <StatCard label="Still to change password" value={pending.length} hint="have not signed in and changed it yet" />
      </div>
      <ScorePicker fields={[{ name: "show", label: "Show", placeholder: "All staff", value: show, options: [{ value: "none", label: "Without a login" }, { value: "has", label: "With a login" }, { value: "change", label: "Must change password" }] }]} />
      <Table>
        <THead><tr><TH>Staff member</TH><TH>Username</TH><TH>Roles</TH><TH>Status</TH><TH>Last sign-in</TH><TH className="text-right">Actions</TH></tr></THead>
        <tbody>
          {list.map((s) => {
            const u = s.user;
            const name = `${s.lastName} ${s.firstName}`;
            const isAdmin = u?.roles.some((r) => r.role.code === "ADMIN");
            return (
              <TR key={s.id}>
                <TD><Link className="font-medium text-brand-800 hover:underline" href={`/staff/${s.id}`}>{name}</Link><span className="block text-xs text-slate-500">{s.staffNo} · {s.designation ?? (s.isTeaching ? "Teacher" : "Staff")}</span></TD>
                <TD className="font-mono text-sm">{u?.username ?? <span className="font-sans text-xs text-slate-400">no login</span>}</TD>
                <TD>{u ? <div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.roleId} color="blue">{r.role.name}</Badge>)}</div> : null}</TD>
                <TD>{u ? <div className="flex flex-wrap gap-1"><StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />{u.mustChangePassword && <Badge color="amber">must change password</Badge>}</div> : null}</TD>
                <TD className="whitespace-nowrap text-xs">{u?.lastLoginAt ? fmtDateTime(u.lastLoginAt) : u ? "never" : ""}</TD>
                <TD className="whitespace-nowrap text-right">
                  {!u ? (
                    <FormDialog trigger="Create login" title={`Login for ${s.firstName} ${s.lastName}`} action={createStaffAccount} triggerSize="sm" wide>
                      <input type="hidden" name="staffId" value={s.id} />
                      <TextField label="Username" name="username" required defaultValue={usernameBase(s.firstName, s.lastName)} autoComplete="off" hint="Letters, numbers, dots. Used to sign in." />
                      <TextField label="Password" name="password" required autoComplete="off" hint={PW_HINT} />
                      <CheckboxField name="mustChange" label="Must change the password at first sign-in (recommended)" defaultChecked />
                      {rolePicker(s.isTeaching)}
                    </FormDialog>
                  ) : (!isAdmin || me.roles.includes("ADMIN")) && (
                    <span className="inline-flex gap-1">
                      <FormDialog trigger="Set password" title={`New password for ${u.username}`} action={adminResetPassword} triggerSize="sm" triggerVariant="outline">
                        <input type="hidden" name="userId" value={u.id} />
                        <TextField label="New password" name="password" required autoComplete="off" hint={PW_HINT} />
                        <CheckboxField name="mustChange" label="Must change it at next sign-in (recommended)" defaultChecked />
                        <p className="text-xs text-slate-500">They are signed out everywhere and use the new password from now on.</p>
                      </FormDialog>
                      {u.id !== me.id && (
                        <ConfirmAction action={setUserActive} fields={{ userId: u.id, active: u.isActive ? "false" : "true" }} label={u.isActive ? "Disable" : "Enable"} variant="ghost"
                          confirm={u.isActive ? `Disable ${u.username}? They will not be able to sign in.` : `Enable ${u.username} again?`} />
                      )}
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
          {list.length === 0 && <TR><TD colSpan={6} className="py-6 text-center text-slate-500">Nobody here.</TD></TR>}
        </tbody>
      </Table>
      <p className="mt-2 text-xs text-slate-500">To add more roles to someone (e.g. Class teacher, Bursar, DOS), use Settings → Users → edit. People see only the menus their roles allow.</p>
    </>
  );
}
