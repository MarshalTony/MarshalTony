import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { changePasswordAction, logoutAction } from "@/server/actions/auth";
import { ActionForm, TextField } from "@/components/forms";
import { Alert } from "@/components/ui/card";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <h2 className="mb-2 text-lg font-semibold">Change password</h2>
      {user.mustChangePassword && <Alert tone="warn" className="mb-4">You must set a new password before continuing.</Alert>}
      <ActionForm action={changePasswordAction} submitLabel="Change password" refresh={false}>
        <TextField label="Current password" name="current" type="password" autoComplete="current-password" required />
        <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters with letters and numbers." />
        <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      </ActionForm>
      <form action={logoutAction} className="mt-3 text-center">
        <button className="text-sm text-slate-500 hover:underline">Sign out</button>
      </form>
    </>
  );
}
