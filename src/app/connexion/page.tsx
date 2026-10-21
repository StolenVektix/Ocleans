import { SignInForm } from "@/components/auth-forms";
import { QuickLogin } from "@/components/quick-login";
import { DEMO_ACCOUNTS, isDemoMode } from "@/lib/demo";

export default function SignInPage() {
  const demoPassword = process.env.DEMO_PASSWORD;
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Se connecter</h1>
      {isDemoMode() && demoPassword && <QuickLogin accounts={DEMO_ACCOUNTS} password={demoPassword} />}
      <SignInForm />
    </main>
  );
}
