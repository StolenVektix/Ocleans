// Domaines étudiants confirmés uniquement : une adresse du personnel (@u-bordeaux.fr) ne doit pas suffire.
// Ajouter un domaine seulement après confirmation auprès de l'établissement.
export const UNIVERSITY_DOMAINS: Readonly<Record<string, string>> = {
  "etu.u-bordeaux.fr": "Université de Bordeaux",
};

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function universityForEmail(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain || !Object.hasOwn(UNIVERSITY_DOMAINS, domain)) return null;
  return UNIVERSITY_DOMAINS[domain];
}
