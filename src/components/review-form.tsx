"use client";

import { useActionState } from "react";
import { submitReviewAction } from "@/server/reviews/actions";
import { Button, Label, LinkButton, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReviewForm({ bookingId, otherFirstName }: { bookingId: string; otherFirstName: string }) {
  const [state, action, pending] = useActionState(submitReviewAction.bind(null, bookingId), {});
  const v = state.values ?? {};
  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-green-50 p-3 text-green-800">Merci pour votre avis !</p>
        <LinkButton href="/" variant="secondary">Retour à l'accueil</LinkButton>
      </div>
    );
  }
  return (
    <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-4">
      <FormError message={state.error} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Votre note pour {otherFirstName}</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer flex-col items-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
              <input type="radio" name="rating" value={n} defaultChecked={v.rating === String(n)} className="sr-only" required />
              <span className="text-lg text-amber-600" aria-hidden>{"★".repeat(n)}</span>
              <span>{n}</span>
            </label>
          ))}
        </div>
        <FieldError errors={state.fieldErrors?.rating} />
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="comment">Un mot sur ce moment (facultatif)</Label>
        <Textarea id="comment" name="comment" maxLength={500} defaultValue={(v.comment as string) ?? ""} />
        <FieldError errors={state.fieldErrors?.comment} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Envoi…" : "Publier mon avis"}</Button>
    </form>
  );
}
