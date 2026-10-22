"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button, Input, Label } from "@/components/ui";
import { FormError } from "@/components/form-message";

function useAuthSubmit(run: (fd: FormData) => Promise<{ error: { message?: string } | null }>, fallback: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } = await run(new FormData(event.currentTarget));
    setPending(false);
    if (error) {
      setError(error.message || fallback);
      return;
    }
    router.push("/bienvenue");
    router.refresh();
  }

  return { pending, error, onSubmit };
}

export function SignUpForm() {
  const { pending, error, onSubmit } = useAuthSubmit(
    (fd) =>
      authClient.signUp.email({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
      }),
    "Inscription impossible. Vérifiez vos informations.",
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Prénom</Label>
        <Input id="name" name="name" autoComplete="given-name" required maxLength={40} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe (8 caractères minimum)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-stone-600">
        Déjà inscrit ? <Link href="/connexion" className="font-medium text-orange-700 underline">Se connecter</Link>
      </p>
    </form>
  );
}

export function SignInForm() {
  const { pending, error, onSubmit } = useAuthSubmit(
    (fd) => authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) }),
    "Email ou mot de passe incorrect.",
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-sm text-stone-600">
        Pas encore de compte ? <Link href="/inscription" className="font-medium text-orange-700 underline">S'inscrire</Link>
      </p>
    </form>
  );
}
