export const SCHOOLS = [
  { id: "u-bordeaux", label: "Université de Bordeaux" },
  { id: "u-bordeaux-montaigne", label: "Université Bordeaux Montaigne" },
  { id: "bordeaux-inp", label: "Bordeaux INP" },
  { id: "sciences-po-bordeaux", label: "Sciences Po Bordeaux" },
  { id: "kedge", label: "KEDGE Business School" },
  { id: "autre", label: "Autre établissement bordelais" },
] as const;

export type SchoolId = (typeof SCHOOLS)[number]["id"];

export const SCHOOL_IDS = SCHOOLS.map((s) => s.id) as [SchoolId, ...SchoolId[]];

export function schoolLabel(id: SchoolId): string {
  return SCHOOLS.find((s) => s.id === id)!.label;
}

// Aucun format officiel confirmé à ce jour : règle commune, surchargeable par établissement.
export const DEFAULT_STUDENT_NUMBER_RULE = /^[A-Z0-9]{5,15}$/;
export const STUDENT_NUMBER_RULES: Partial<Record<SchoolId, RegExp>> = {};
