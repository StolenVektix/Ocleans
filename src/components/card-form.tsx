"use client";

import { useActionState, useState } from "react";
import { SCHOOLS } from "@/config/schools";
import { CARD_FILE_MESSAGES, CARD_MAX_BYTES } from "@/domain/verification";
import { submitStudentCardAction } from "@/server/verification/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function CardForm() {
  const [state, action, pending] = useActionState(submitStudentCardAction, {});
  const [fileError, setFileError] = useState<string | undefined>();
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};

  if (state.ok) {
    return <p className="rounded-lg bg-green-50 p-3 text-green-800">Carte envoyée ! L'équipe Ocleans la vérifie au plus vite.</p>;
  }

  return (
    <form
      key={JSON.stringify(state.values ?? null)}
      action={action}
      onSubmit={(event) => {
        const file = (event.currentTarget.elements.namedItem("card") as HTMLInputElement).files?.[0];
        if (file && file.size > CARD_MAX_BYTES) {
          event.preventDefault();
          setFileError(CARD_FILE_MESSAGES.TOO_LARGE);
        }
      }}
      className="space-y-4"
    >
      <FormError message={state.error} />
      <div className="space-y-1.5">
        <Label htmlFor="school">Établissement</Label>
        <Select id="school" name="school" defaultValue={(v.school as string) ?? ""} required>
          <option value="">Choisir…</option>
          {SCHOOLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <FieldError errors={fe.school} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="studentNumber">Numéro étudiant</Label>
        <Input id="studentNumber" name="studentNumber" defaultValue={(v.studentNumber as string) ?? ""} autoComplete="off" required maxLength={30} />
        <FieldError errors={fe.studentNumber} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card">Photo de votre carte étudiante (JPEG, PNG ou HEIC, 4 Mo maximum)</Label>
        {/* Sans HEIC dans accept, iOS convertit la photo en JPEG ; le serveur accepte quand même le HEIC (ordinateurs). */}
        <Input id="card" name="card" type="file" accept="image/jpeg,image/png" required onChange={() => setFileError(undefined)} />
        <FieldError errors={fileError ? [fileError] : fe.card} />
      </div>
      <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
        Votre photo sert uniquement à vérifier votre statut étudiant. Elle est stockée de façon privée, consultée par l'équipe Ocleans,
        puis supprimée dès la décision. Nous conservons seulement votre établissement, votre numéro étudiant et le résultat.{" "}
        <a href="/donnees-personnelles" className="underline">En savoir plus</a>
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer ma carte"}
      </Button>
    </form>
  );
}
