import Link from "next/link";
import { requestResetAction } from "@/server/actions/auth";
import { ActionForm, TextField } from "@/components/forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Reset password</h2>
      <p className="mb-4 text-sm text-slate-500">We will email a reset link to the address on your account. Parents and students without email should ask the school office to reset their password.</p>
      <ActionForm action={requestResetAction} submitLabel="Send reset link" refresh={false}>
        <TextField label="Username or email" name="identifier" required />
      </ActionForm>
      <div className="mt-4 text-center text-sm"><Link href="/login" className="text-brand-700 hover:underline">Back to sign in</Link></div>
    </>
  );
}
