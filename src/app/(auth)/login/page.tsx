import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/server/auth";
import { loginAction } from "@/server/actions/auth";
import { ActionForm, TextField } from "@/components/forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.roles));
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">Sign in</h2>
      <ActionForm action={loginAction} submitLabel="Sign in" refresh={false}>
        <TextField label="Username" name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">Forgot password?</Link>
      </div>
    </>
  );
}
