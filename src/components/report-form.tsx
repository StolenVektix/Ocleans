"use client";

import { useActionState } from "react";
import { createReportAction } from "@/server/reports/actions";
import { Button, Label, LinkButton, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReportForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(createReportAction.bind(null, bookingId), {});
  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-green-50 p-3 text-green-800">Signalement envoyé. L'équipe Ocleans va l'examiner.</p>
        <LinkButton href="/" variant="secondary">Retour à l'accueil</LinkButton>
      </div>
    );
  }
  return (
    <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-3">
      <FormError message={state.error} />
      <Label htmlFor="reason">Que s'est-il passé ?</Label>
      <Textarea id="reason" name="reason" required minLength={10} maxLength={1000} defaultValue={(state.values?.reason as string) ?? ""} />
      <FieldError errors={state.fieldErrors?.reason} />
      <p className="text-xs text-stone-500">Votre signalement est confidentiel : seule l'équipe Ocleans le lit.</p>
      <Button type="submit" variant="danger" disabled={pending} className="w-full">{pending ? "Envoi…" : "Envoyer le signalement"}</Button>
    </form>
  );
}
