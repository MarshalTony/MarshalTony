import { resetPasswordAction } from "@/server/actions/auth";
import { ActionForm, TextField } from "@/components/forms";

export const metadata = { title: "Set new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Set a new password</h2>
      <ActionForm action={resetPasswordAction} submitLabel="Update password" refresh={false}>
        <input type="hidden" name="token" value={token ?? ""} />
        <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters with letters and numbers." />
        <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      </ActionForm>
    </>
  );
}
