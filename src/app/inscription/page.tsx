import { SignUpForm } from "@/components/auth-forms";

export default function SignUpPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Créer un compte</h1>
      <SignUpForm />
    </main>
  );
}
