import { describe, expect, it } from "vitest";
import { RATE_LIMITS, assertUnderLimit } from "./rate-limits";

describe("assertUnderLimit", () => {
  it("laisse passer sous la limite et bloque à la limite", () => {
    expect(() => assertUnderLimit("bookingRequests", RATE_LIMITS.bookingRequests.max - 1)).not.toThrow();
    expect(() => assertUnderLimit("bookingRequests", RATE_LIMITS.bookingRequests.max)).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });

  it("fixe les limites de la spec", () => {
    expect(RATE_LIMITS.bookingRequests).toEqual({ max: 10, windowMs: 24 * 3600_000 });
    expect(RATE_LIMITS.messages).toEqual({ max: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.reports).toEqual({ max: 5, windowMs: 24 * 3600_000 });
    expect(RATE_LIMITS.cardSubmissions).toEqual({ max: 3, windowMs: 24 * 3600_000 });
  });

  it("dit quand réessayer", () => {
    expect(() => assertUnderLimit("messages", 30)).toThrow("Réessayez dans une minute.");
    expect(() => assertUnderLimit("reports", 5)).toThrow("Réessayez dans 24 heures.");
  });
});
