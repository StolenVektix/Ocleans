import { describe, expect, it } from "vitest";
import {
  assertCanCreateMeal,
  assertCanDecide,
  assertCanEditMeal,
  assertCanRequest,
  canSeeAddress,
  seatsLeft,
  type Actor,
  type MealState,
} from "./bookings";

const now = new Date("2026-10-21T10:00:00Z");
const student: Actor = { userId: "s1", role: "student", verificationStatus: "verified", suspended: false };
const host: Actor = { userId: "h1", role: "host", verificationStatus: "none", suspended: false };
const meal: MealState = { hostId: "h1", status: "open", startsAt: new Date("2026-10-25T18:30:00Z"), seatsTotal: 2 };

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("seatsLeft", () => {
  it("ne descend jamais sous zéro", () => {
    expect(seatsLeft(2, 0)).toBe(2);
    expect(seatsLeft(2, 3)).toBe(0);
  });
});

describe("assertCanCreateMeal", () => {
  it("réserve la création aux hôtes actifs", () => {
    expect(code(() => assertCanCreateMeal(host))).toBeNull();
    expect(code(() => assertCanCreateMeal(student))).toBe("FORBIDDEN");
    expect(code(() => assertCanCreateMeal({ ...host, suspended: true }))).toBe("SUSPENDED");
  });
});

describe("assertCanRequest", () => {
  const base = { actor: student, meal, acceptedCount: 0, alreadyRequested: false, now };

  it("autorise un étudiant vérifié", () => {
    expect(code(() => assertCanRequest(base))).toBeNull();
  });

  it("refuse dans chaque cas interdit", () => {
    expect(code(() => assertCanRequest({ ...base, actor: { ...student, verificationStatus: "pending" } }))).toBe("NOT_VERIFIED");
    expect(code(() => assertCanRequest({ ...base, actor: host }))).toBe("FORBIDDEN");
    expect(code(() => assertCanRequest({ ...base, actor: { ...student, suspended: true } }))).toBe("SUSPENDED");
    expect(code(() => assertCanRequest({ ...base, meal: { ...meal, status: "cancelled" } }))).toBe("MEAL_CANCELLED");
    expect(code(() => assertCanRequest({ ...base, now: new Date("2026-10-26T00:00:00Z") }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanRequest({ ...base, alreadyRequested: true }))).toBe("ALREADY_REQUESTED");
    expect(code(() => assertCanRequest({ ...base, acceptedCount: 2 }))).toBe("MEAL_FULL");
  });
});

describe("assertCanDecide", () => {
  const base = { actor: host, meal, bookingStatus: "pending" as const, acceptedCount: 0, decision: "accept" as const, now };

  it("autorise l'hôte du repas", () => {
    expect(code(() => assertCanDecide(base))).toBeNull();
  });

  it("refuse un autre hôte, une demande déjà traitée, un repas complet", () => {
    expect(code(() => assertCanDecide({ ...base, actor: { ...host, userId: "h2" } }))).toBe("FORBIDDEN");
    expect(code(() => assertCanDecide({ ...base, bookingStatus: "accepted" }))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCanDecide({ ...base, acceptedCount: 2 }))).toBe("MEAL_FULL");
  });

  it("permet de refuser même quand le repas est complet", () => {
    expect(code(() => assertCanDecide({ ...base, acceptedCount: 2, decision: "decline" }))).toBeNull();
  });
});

describe("assertCanEditMeal", () => {
  const base = { actor: host, meal, newSeatsTotal: 2, acceptedCount: 1, now };

  it("autorise l'hôte avant le repas", () => {
    expect(code(() => assertCanEditMeal(base))).toBeNull();
  });

  it("refuse sous le nombre d'acceptés, après le début, ou pour un autre hôte", () => {
    expect(code(() => assertCanEditMeal({ ...base, newSeatsTotal: 0 }))).toBe("SEATS_BELOW_ACCEPTED");
    expect(code(() => assertCanEditMeal({ ...base, now: new Date("2026-10-26T00:00:00Z") }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanEditMeal({ ...base, actor: { ...host, userId: "h2" } }))).toBe("FORBIDDEN");
  });
});

describe("canSeeAddress", () => {
  it("réserve l'adresse à l'hôte et aux étudiants acceptés", () => {
    expect(canSeeAddress({ viewerId: "h1", hostId: "h1", viewerBookingStatus: null })).toBe(true);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: "accepted" })).toBe(true);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: "pending" })).toBe(false);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: null })).toBe(false);
    expect(canSeeAddress({ viewerId: null, hostId: "h1", viewerBookingStatus: null })).toBe(false);
  });
});
