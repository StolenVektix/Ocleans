import { isNeighborhood, type Neighborhood } from "./neighborhoods";

// Centre approximatif de chaque quartier : la carte ne montre jamais l'adresse (règle 7).
export const NEIGHBORHOOD_COORDINATES: Record<Neighborhood, { lat: number; lng: number }> = {
  Bacalan: { lat: 44.874, lng: -0.554 },
  Chartrons: { lat: 44.853, lng: -0.572 },
  "Grand Parc": { lat: 44.858, lng: -0.583 },
  "Saint-Seurin": { lat: 44.843, lng: -0.589 },
  Caudéran: { lat: 44.848, lng: -0.615 },
  "Saint-Pierre": { lat: 44.84, lng: -0.572 },
  "Saint-Michel": { lat: 44.834, lng: -0.568 },
  Victoire: { lat: 44.831, lng: -0.573 },
  Capucins: { lat: 44.829, lng: -0.565 },
  Nansouty: { lat: 44.822, lng: -0.576 },
  "Saint-Augustin": { lat: 44.834, lng: -0.603 },
  Bastide: { lat: 44.842, lng: -0.556 },
  Talence: { lat: 44.808, lng: -0.59 },
  Pessac: { lat: 44.806, lng: -0.631 },
  Mérignac: { lat: 44.842, lng: -0.645 },
  Bègles: { lat: 44.808, lng: -0.548 },
  "Le Bouscat": { lat: 44.865, lng: -0.599 },
  Gradignan: { lat: 44.772, lng: -0.615 },
  Cenon: { lat: 44.857, lng: -0.531 },
  Floirac: { lat: 44.836, lng: -0.528 },
};

export const BORDEAUX_CENTER = { lat: 44.8378, lng: -0.5792 };

export interface MapPoint {
  neighborhood: string;
  lat: number;
  lng: number;
  meals: { id: string; title: string; when: string; seatsLeft: number }[];
}

export function groupMealsByNeighborhood(
  meals: { id: string; title: string; neighborhood: string; when: string; seatsLeft: number }[],
): MapPoint[] {
  const points = new Map<string, MapPoint>();
  for (const { neighborhood, ...meal } of meals) {
    if (!isNeighborhood(neighborhood)) continue;
    const point = points.get(neighborhood) ?? { neighborhood, ...NEIGHBORHOOD_COORDINATES[neighborhood], meals: [] };
    point.meals.push(meal);
    points.set(neighborhood, point);
  }
  return [...points.values()];
}
