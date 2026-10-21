"use client";

import { useActionState } from "react";
import { createProfileAction } from "@/server/profiles/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function OnboardingForm({ defaultFirstName }: { defaultFirstName: string }) {
  const [state, action, pending] = useActionState(createProfileAction, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Vous êtes…</legend>
        <label className="flex items-start gap-3 rounded-lg border border-stone-300 bg-white p-3">
          <input type="radio" name="role" value="student" defaultChecked={v.role === "student"} className="mt-1" />
          <span><strong>Étudiant·e</strong> — je cherche un repas partagé</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-stone-300 bg-white p-3">
          <input type="radio" name="role" value="host" defaultChecked={v.role === "host"} className="mt-1" />
          <span><strong>Hôte</strong> — je cuisine une portion de plus à partager</span>
        </label>
        <FieldError errors={fe.role} />
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="firstName">Prénom</Label>
        <Input id="firstName" name="firstName" defaultValue={(v.firstName as string) ?? defaultFirstName} required maxLength={40} />
        <FieldError errors={fe.firstName} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="school">Établissement (étudiants uniquement)</Label>
        <Input id="school" name="school" defaultValue={(v.school as string) ?? ""} placeholder="Ex. : Université de Bordeaux" maxLength={80} />
        <FieldError errors={fe.school} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : "Continuer"}
      </Button>
    </form>
  );
}
