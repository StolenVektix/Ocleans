"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button, Card } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function QuickLogin({ accounts, password }: { accounts: readonly { email: string; label: string }[]; password: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function login(email: string) {
    setPending(email);
    setError(undefined);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(null);
    if (error) {
      setError("Connexion de démo impossible. Les données de démo ont-elles été créées (npm run seed:demo) ?");
      return;
    }
    router.push("/bienvenue");
    router.refresh();
  }

  return (
    <Card className="space-y-3 border-amber-300 bg-amber-50">
      <h2 className="font-semibold text-amber-900">Démo : connexion en un clic</h2>
      <FormError message={error} />
      <div className="flex flex-col gap-2">
        {accounts.map((a) => (
          <Button key={a.email} type="button" variant="secondary" disabled={pending !== null} onClick={() => login(a.email)}>
            {pending === a.email ? "Connexion…" : a.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
