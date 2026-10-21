export const DIET_TAGS = {
  vegetarien: "Végétarien",
  vegan: "Végan",
  halal: "Halal",
  casher: "Casher",
  sans_gluten: "Sans gluten",
  sans_lactose: "Sans lactose",
  sans_porc: "Sans porc",
} as const;

export type DietTag = keyof typeof DIET_TAGS;

export const DIET_TAG_KEYS = Object.keys(DIET_TAGS) as [DietTag, ...DietTag[]];

export function isDietTag(value: string): value is DietTag {
  return value in DIET_TAGS;
}
