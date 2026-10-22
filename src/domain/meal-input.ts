import { z } from "zod";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { DIET_TAG_KEYS } from "@/config/diet-tags";
import { parisLocalToDate } from "./dates";

const baseSchema = z.object({
  title: z.string().trim().min(3, "3 caractères minimum").max(80, "80 caractères maximum"),
  description: z
    .string()
    .trim()
    .min(10, "10 caractères minimum")
    .max(1000, "1000 caractères maximum"),
  startsAtLocal: z.string().min(1, "Indiquez la date et l'heure"),
  neighborhood: z.enum(NEIGHBORHOODS, { error: "Choisissez un quartier dans la liste" }),
  address: z.string().trim().min(5, "Adresse trop courte").max(200, "200 caractères maximum"),
  seatsTotal: z.coerce
    .number({ error: "Indiquez un nombre" })
    .int("Nombre entier attendu")
    .min(1, "Au moins 1 place")
    .max(6, "6 places maximum"),
  dietTags: z.array(z.enum(DIET_TAG_KEYS, { error: "Régime inconnu" })).default([]),
  allergens: z.string().trim().max(200, "200 caractères maximum").default(""),
});

export function mealInputSchema(now: Date) {
  return baseSchema.transform((value, ctx) => {
    let startsAt: Date;
    try {
      startsAt = parisLocalToDate(value.startsAtLocal);
    } catch {
      ctx.addIssue({ code: "custom", path: ["startsAtLocal"], message: "Date et heure invalides" });
      return z.NEVER;
    }
    if (startsAt.getTime() <= now.getTime()) {
      ctx.addIssue({ code: "custom", path: ["startsAtLocal"], message: "La date doit être dans le futur" });
      return z.NEVER;
    }
    return {
      title: value.title,
      description: value.description,
      startsAt,
      neighborhood: value.neighborhood,
      address: value.address,
      seatsTotal: value.seatsTotal,
      dietTags: value.dietTags,
      allergens: value.allergens,
    };
  });
}

export type MealInput = z.output<ReturnType<typeof mealInputSchema>>;
