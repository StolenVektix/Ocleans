import { DomainError } from "./errors";

const HOUR = 3600_000;

// Spec §9 (et cartes étudiantes : 3 par jour pour éviter de remplir le stockage).
export const RATE_LIMITS = {
  bookingRequests: { max: 10, windowMs: 24 * HOUR },
  messages: { max: 30, windowMs: 60_000 },
  reports: { max: 5, windowMs: 24 * HOUR },
  cardSubmissions: { max: 3, windowMs: 24 * HOUR },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export function assertUnderLimit(key: RateLimitKey, recentCount: number): void {
  if (recentCount >= RATE_LIMITS[key].max) throw new DomainError("RATE_LIMITED");
}
