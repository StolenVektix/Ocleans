"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/server/form-state";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function CancelForm({
  action,
  buttonLabel,
  confirmLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  buttonLabel: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();
  if (state.ok) return <p className="text-sm text-stone-600">Annulation enregistrée.</p>;
  return (
    <details className="rounded-lg border border-stone-200 bg-white p-3" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-sm font-medium text-red-700">{buttonLabel}</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <FormError message={state.error} />
        <Label htmlFor={id}>Raison (communiquée à l'autre personne)</Label>
        <Input id={id} name="reason" required minLength={3} maxLength={300} defaultValue={(state.values?.reason as string) ?? ""} />
        <FieldError errors={state.fieldErrors?.reason} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Annulation…" : confirmLabel}
        </Button>
      </form>
    </details>
  );
}
