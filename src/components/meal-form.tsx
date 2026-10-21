"use client";

import { useActionState } from "react";
import { DIET_TAGS, DIET_TAG_KEYS, type DietTag } from "@/config/diet-tags";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import type { FormState } from "@/server/form-state";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export interface MealFormDefaults {
  title: string;
  description: string;
  startsAtLocal: string;
  neighborhood: string;
  address: string;
  seatsTotal: number;
  dietTags: DietTag[];
  allergens: string;
}

export function MealForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: MealFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const text = (key: keyof MealFormDefaults) => (v ? String(v[key] ?? "") : String(defaults?.[key] ?? ""));
  const checkedTags = v ? ((v.dietTags as string[]) ?? []) : (defaults?.dietTags ?? []);

  return (
    // La clé remonte le formulaire après chaque envoi : React réinitialise les champs, et un <select> ne reprend pas sinon sa valeur.
    <form key={JSON.stringify(v ?? null)} action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="space-y-1.5">
        <Label htmlFor="title">Plat proposé</Label>
        <Input id="title" name="title" defaultValue={text("title")} placeholder="Ex. : Blanquette de veau" required maxLength={80} />
        <FieldError errors={fe.title} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={text("description")} placeholder="Ce que vous cuisinez, l'ambiance à table…" required maxLength={1000} />
        <FieldError errors={fe.description} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startsAtLocal">Date et heure du repas</Label>
        <Input id="startsAtLocal" name="startsAtLocal" type="datetime-local" defaultValue={text("startsAtLocal")} required />
        <FieldError errors={fe.startsAtLocal} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="neighborhood">Quartier (visible par tous)</Label>
          <Select id="neighborhood" name="neighborhood" defaultValue={text("neighborhood")} required>
            <option value="">Choisir…</option>
            {NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
          <FieldError errors={fe.neighborhood} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seatsTotal">Nombre de places</Label>
          <Input id="seatsTotal" name="seatsTotal" type="number" min={1} max={6} defaultValue={text("seatsTotal") || "1"} required />
          <FieldError errors={fe.seatsTotal} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Adresse exacte</Label>
        <Input id="address" name="address" defaultValue={text("address")} autoComplete="street-address" required maxLength={200} />
        <p className="text-xs text-stone-500">Communiquée uniquement aux étudiants que vous acceptez.</p>
        <FieldError errors={fe.address} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Régimes compatibles</legend>
        <div className="flex flex-wrap gap-2">
          {DIET_TAG_KEYS.map((tag) => (
            <label key={tag} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm">
              <input type="checkbox" name="dietTags" value={tag} defaultChecked={checkedTags.includes(tag)} />
              {DIET_TAGS[tag]}
            </label>
          ))}
        </div>
        <FieldError errors={fe.dietTags} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="allergens">Allergènes (facultatif)</Label>
        <Input id="allergens" name="allergens" defaultValue={text("allergens")} placeholder="Ex. : fruits à coque, œufs" maxLength={200} />
        <FieldError errors={fe.allergens} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
