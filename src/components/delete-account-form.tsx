"use client";

import { useActionState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { deleteAccountAction } from "@/server/account/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, {});

  useEffect(() => {
    if (!state.ok) return;
    // Le compte n'existe plus : on efface les cookies de session puis on quitte la page.
    authClient.signOut().finally(() => window.location.assign("/"));
  }, [state.ok]);

  if (state.ok) return <p className="rounded-lg bg-stone-100 p-3">Votre compte a été supprimé. Au revoir et merci !</p>;

  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <Label htmlFor="confirmation">Tapez SUPPRIMER pour confirmer</Label>
      <Input id="confirmation" name="confirmation" autoComplete="off" required />
      <FieldError errors={state.fieldErrors?.confirmation} />
      <Button type="submit" variant="danger" disabled={pending}>{pending ? "Suppression…" : "Supprimer définitivement mon compte"}</Button>
    </form>
  );
}
