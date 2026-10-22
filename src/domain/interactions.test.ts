import { describe, expect, it } from "vitest";
import type { Actor, MealState } from "./bookings";
import {
  assertCanCancelBooking,
  assertCanCancelMeal,
  assertCanReport,
  assertCanReview,
  canCancelBooking,
  canReadThread,
  canReview,
  canWriteThread,
  cancellationSchema,
  otherParticipantId,
  participantRole,
  type BookingContext,
} from "./interactions";

const DAY = 24 * 3600 * 1000;
const now = new Date("2026-10-22T10:00:00Z");
const host: Actor = { userId: "h1", role: "host", verificationStatus: "none", suspended: false };
const student: Actor = { userId: "s1", role: "student", verificationStatus: "verified", suspended: false };
const outsider: Actor = { userId: "x1", role: "student", verificationStatus: "verified", suspended: false };
const meal: MealState = { hostId: "h1", status: "open", startsAt: new Date(now.getTime() + 2 * DAY), seatsTotal: 2 };
const ctx: BookingContext = { hostId: "h1", studentId: "s1", bookingStatus: "accepted", meal };
const past = (days: number): BookingContext => ({ ...ctx, meal: { ...meal, startsAt: new Date(now.getTime() - days * DAY) } });

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("participants", () => {
  it("identifie l'hôte, l'étudiant et l'autre participant", () => {
    expect(participantRole(host, ctx)).toBe("host");
    expect(participantRole(student, ctx)).toBe("student");
    expect(participantRole(outsider, ctx)).toBeNull();
    expect(otherParticipantId(host, ctx)).toBe("s1");
    expect(otherParticipantId(student, ctx)).toBe("h1");
  });
});

describe("cancellationSchema", () => {
  it("exige un motif de 3 à 300 caractères", () => {
    expect(cancellationSchema.parse({ reason: "  Imprévu  " }).reason).toBe("Imprévu");
    expect(cancellationSchema.safeParse({ reason: "ok" }).success).toBe(false);
    expect(cancellationSchema.safeParse({ reason: "x".repeat(301) }).success).toBe(false);
    expect(cancellationSchema.safeParse({}).success).toBe(false);
  });
});

describe("annulation", () => {
  it("laisse l'hôte annuler son repas à venir, pas un autre ni après le début", () => {
    expect(code(() => assertCanCancelMeal({ actor: host, meal, now }))).toBeNull();
    expect(code(() => assertCanCancelMeal({ actor: student, meal, now }))).toBe("FORBIDDEN");
    expect(code(() => assertCanCancelMeal({ actor: host, meal: { ...meal, status: "cancelled" }, now }))).toBe("MEAL_CANCELLED");
    expect(code(() => assertCanCancelMeal({ actor: host, meal: past(1).meal, now }))).toBe("MEAL_STARTED");
  });

  it("laisse l'étudiant annuler une demande en attente ou acceptée, avant le repas", () => {
    expect(code(() => assertCanCancelBooking({ actor: student, ctx, now }))).toBeNull();
    expect(canCancelBooking({ actor: student, ctx: { ...ctx, bookingStatus: "pending" }, now })).toBe(true);
    expect(code(() => assertCanCancelBooking({ actor: host, ctx, now }))).toBe("FORBIDDEN");
    expect(code(() => assertCanCancelBooking({ actor: student, ctx: { ...ctx, bookingStatus: "declined" }, now }))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCanCancelBooking({ actor: student, ctx: past(1), now }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanCancelBooking({ actor: { ...student, suspended: true }, ctx, now }))).toBe("SUSPENDED");
  });
});

describe("conversation", () => {
  it("est lisible par les participants d'une réservation acceptée ou annulée", () => {
    expect(canReadThread(student, ctx)).toBe(true);
    expect(canReadThread(host, { ...ctx, bookingStatus: "cancelled" })).toBe(true);
    expect(canReadThread(student, { ...ctx, bookingStatus: "pending" })).toBe(false);
    expect(canReadThread(outsider, ctx)).toBe(false);
  });

  it("n'est modifiable que sur une réservation acceptée, repas ouvert, jusqu'à 7 jours après", () => {
    expect(canWriteThread(student, ctx, now)).toBe(true);
    expect(canWriteThread(host, past(6), now)).toBe(true);
    expect(canWriteThread(host, past(8), now)).toBe(false);
    expect(canWriteThread(student, { ...ctx, bookingStatus: "cancelled" }, now)).toBe(false);
    expect(canWriteThread(student, { ...ctx, meal: { ...meal, status: "cancelled" } }, now)).toBe(false);
    expect(canWriteThread({ ...student, suspended: true }, ctx, now)).toBe(false);
    expect(canWriteThread(outsider, ctx, now)).toBe(false);
  });
});

describe("avis", () => {
  it("est possible après le repas, une fois, pour les participants d'une réservation acceptée", () => {
    expect(code(() => assertCanReview({ actor: student, ctx: past(1), alreadyReviewed: false, now }))).toBeNull();
    expect(code(() => assertCanReview({ actor: student, ctx, alreadyReviewed: false, now }))).toBe("REVIEW_TOO_EARLY");
    expect(code(() => assertCanReview({ actor: student, ctx: past(1), alreadyReviewed: true, now }))).toBe("ALREADY_REVIEWED");
    expect(code(() => assertCanReview({ actor: student, ctx: { ...past(1), bookingStatus: "declined" }, alreadyReviewed: false, now }))).toBe("REVIEW_NOT_ALLOWED");
    expect(code(() => assertCanReview({ actor: outsider, ctx: past(1), alreadyReviewed: false, now }))).toBe("FORBIDDEN");
    expect(canReview({ actor: host, ctx: past(1), alreadyReviewed: false, now })).toBe(true);
  });
});

describe("signalement", () => {
  it("est réservé aux participants actifs", () => {
    expect(code(() => assertCanReport({ actor: student, ctx: { ...ctx, bookingStatus: "pending" } }))).toBeNull();
    expect(code(() => assertCanReport({ actor: outsider, ctx }))).toBe("FORBIDDEN");
    expect(code(() => assertCanReport({ actor: { ...host, suspended: true }, ctx }))).toBe("SUSPENDED");
  });
});
