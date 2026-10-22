"use client";

import { useActionState } from "react";
import { requestBookingAction } from "@/server/bookings/actions";
import { Button, Label, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function RequestForm({ mealId, hostFirstName }: { mealId: string; hostFirstName: string }) {
  const [state, action, pending] = useActionState(requestBookingAction.bind(null, mealId), {});
  if (state.ok) {
    return <p className="rounded-lg bg-green-50 p-3 text-green-800">Demande envoyée ! {hostFirstName} va vous répondre.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <div className="space-y-1.5">
        <Label htmlFor="message">Un petit mot pour {hostFirstName} (facultatif)</Label>
        <Textarea id="message" name="message" maxLength={500} defaultValue={(state.values?.message as string) ?? ""} placeholder="Présentez-vous en quelques mots…" />
        <FieldError errors={state.fieldErrors?.message} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Demander à partager ce repas"}
      </Button>
    </form>
  );
}
