import { describe, expect, it } from "vitest";
import { mealInputSchema } from "./meal-input";

const now = new Date("2026-10-21T10:00:00Z");
const valid = {
  title: "  Blanquette de veau ",
  description: "Une blanquette comme chez ma grand-mère.",
  startsAtLocal: "2026-10-25T19:30",
  neighborhood: "Chartrons",
  address: "12 rue Notre-Dame, 33000 Bordeaux",
  seatsTotal: "2",
  dietTags: ["sans_porc"],
  allergens: "",
};

describe("mealInputSchema", () => {
  it("accepte une saisie valide et convertit la date de Paris", () => {
    const out = mealInputSchema(now).parse(valid);
    expect(out.title).toBe("Blanquette de veau");
    expect(out.seatsTotal).toBe(2);
    expect(out.startsAt.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(out).not.toHaveProperty("startsAtLocal");
  });

  it("refuse un quartier hors liste", () => {
    expect(mealInputSchema(now).safeParse({ ...valid, neighborhood: "Paris 11e" }).success).toBe(false);
  });

  it("refuse une date passée avec un message sur le champ", () => {
    const r = mealInputSchema(now).safeParse({ ...valid, startsAtLocal: "2026-10-20T19:30" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["startsAtLocal"]);
  });

  it("refuse 0 ou 7 places et un régime inconnu", () => {
    expect(mealInputSchema(now).safeParse({ ...valid, seatsTotal: "0" }).success).toBe(false);
    expect(mealInputSchema(now).safeParse({ ...valid, seatsTotal: "7" }).success).toBe(false);
    expect(mealInputSchema(now).safeParse({ ...valid, dietTags: ["pizza"] }).success).toBe(false);
  });

  it("met des valeurs par défaut pour les régimes et allergènes", () => {
    const out = mealInputSchema(now).parse({ ...valid, dietTags: undefined, allergens: undefined });
    expect(out.dietTags).toEqual([]);
    expect(out.allergens).toBe("");
  });
});
