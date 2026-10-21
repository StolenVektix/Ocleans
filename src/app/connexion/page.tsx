import { SignInForm } from "@/components/auth-forms";

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Se connecter</h1>
      <SignInForm />
    </main>
  );
}
