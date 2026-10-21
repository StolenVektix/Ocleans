export const NEIGHBORHOODS = [
  "Bacalan",
  "Chartrons",
  "Grand Parc",
  "Saint-Seurin",
  "Caudéran",
  "Saint-Pierre",
  "Saint-Michel",
  "Victoire",
  "Capucins",
  "Nansouty",
  "Saint-Augustin",
  "Bastide",
  "Talence",
  "Pessac",
  "Mérignac",
  "Bègles",
  "Le Bouscat",
  "Gradignan",
  "Cenon",
  "Floirac",
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

export function isNeighborhood(value: string): value is Neighborhood {
  return (NEIGHBORHOODS as readonly string[]).includes(value);
}
