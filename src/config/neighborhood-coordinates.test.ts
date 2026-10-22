import { describe, expect, it } from "vitest";
import { NEIGHBORHOODS } from "./neighborhoods";
import { NEIGHBORHOOD_COORDINATES, groupMealsByNeighborhood } from "./neighborhood-coordinates";

describe("coordonnées des quartiers", () => {
  it("couvre chaque quartier, dans la métropole bordelaise", () => {
    for (const n of NEIGHBORHOODS) {
      const c = NEIGHBORHOOD_COORDINATES[n];
      expect(c, n).toBeDefined();
      expect(c.lat).toBeGreaterThan(44.7);
      expect(c.lat).toBeLessThan(44.95);
      expect(c.lng).toBeGreaterThan(-0.72);
      expect(c.lng).toBeLessThan(-0.45);
    }
  });

  it("regroupe les repas par quartier et ignore un quartier inconnu", () => {
    const points = groupMealsByNeighborhood([
      { id: "1", title: "Blanquette", neighborhood: "Chartrons", when: "samedi", seatsLeft: 1 },
      { id: "2", title: "Soupe", neighborhood: "Chartrons", when: "dimanche", seatsLeft: 2 },
      { id: "3", title: "Tajine", neighborhood: "Saint-Michel", when: "lundi", seatsLeft: 0 },
      { id: "4", title: "Mystère", neighborhood: "Atlantide", when: "jamais", seatsLeft: 1 },
    ]);
    expect(points.map((p) => [p.neighborhood, p.meals.length])).toEqual([
      ["Chartrons", 2],
      ["Saint-Michel", 1],
    ]);
    expect(points[0]).toMatchObject(NEIGHBORHOOD_COORDINATES.Chartrons);
  });
});
