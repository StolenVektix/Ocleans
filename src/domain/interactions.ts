import { z } from "zod";
import { assertActive, type Actor, type MealState } from "./bookings";
import { DomainError } from "./errors";
import type { BookingStatus } from "./types";

export const MESSAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

export interface BookingContext {
  hostId: string;
  studentId: string;
  bookingStatus: BookingStatus;
  meal: MealState;
}

export const cancellationSchema = z.object({
  reason: z
    .string({ error: "Indiquez la raison de l'annulation" })
    .trim()
    .min(3, "Indiquez la raison de l'annulation (3 caractères minimum)")
    .max(300, "300 caractères maximum"),
});

function holds(check: () => void): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

const hasStarted = (meal: MealState, now: Date) => meal.startsAt.getTime() <= now.getTime();

export function participantRole(actor: Actor, ctx: BookingContext): "host" | "student" | null {
  if (actor.userId === ctx.hostId) return "host";
  if (actor.userId === ctx.studentId) return "student";
  return null;
}

export function otherParticipantId(actor: Actor, ctx: BookingContext): string {
  return actor.userId === ctx.hostId ? ctx.studentId : ctx.hostId;
}

export function assertCanCancelMeal(args: { actor: Actor; meal: MealState; now: Date }): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  if (args.meal.status === "cancelled") throw new DomainError("MEAL_CANCELLED");
  if (hasStarted(args.meal, args.now)) throw new DomainError("MEAL_STARTED");
}

export const canCancelMeal = (args: { actor: Actor; meal: MealState; now: Date }) => holds(() => assertCanCancelMeal(args));

export function assertCanCancelBooking(args: { actor: Actor; ctx: BookingContext; now: Date }): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.ctx.studentId) throw new DomainError("FORBIDDEN");
  if (args.ctx.bookingStatus !== "pending" && args.ctx.bookingStatus !== "accepted") throw new DomainError("INVALID_TRANSITION");
  if (hasStarted(args.ctx.meal, args.now)) throw new DomainError("MEAL_STARTED");
}

export const canCancelBooking = (args: { actor: Actor; ctx: BookingContext; now: Date }) => holds(() => assertCanCancelBooking(args));

export function canReadThread(actor: Actor, ctx: BookingContext): boolean {
  return participantRole(actor, ctx) !== null && (ctx.bookingStatus === "accepted" || ctx.bookingStatus === "cancelled");
}

export function canWriteThread(actor: Actor, ctx: BookingContext, now: Date): boolean {
  return (
    participantRole(actor, ctx) !== null &&
    !actor.suspended &&
    ctx.bookingStatus === "accepted" &&
    ctx.meal.status === "open" &&
    now.getTime() < ctx.meal.startsAt.getTime() + MESSAGE_WINDOW_DAYS * DAY_MS
  );
}

export function assertCanReview(args: { actor: Actor; ctx: BookingContext; alreadyReviewed: boolean; now: Date }): void {
  assertActive(args.actor);
  if (participantRole(args.actor, args.ctx) === null) throw new DomainError("FORBIDDEN");
  if (args.ctx.bookingStatus !== "accepted") throw new DomainError("REVIEW_NOT_ALLOWED");
  if (!hasStarted(args.ctx.meal, args.now)) throw new DomainError("REVIEW_TOO_EARLY");
  if (args.alreadyReviewed) throw new DomainError("ALREADY_REVIEWED");
}

export const canReview = (args: { actor: Actor; ctx: BookingContext; alreadyReviewed: boolean; now: Date }) =>
  holds(() => assertCanReview(args));

export function assertCanReport(args: { actor: Actor; ctx: BookingContext }): void {
  assertActive(args.actor);
  if (participantRole(args.actor, args.ctx) === null) throw new DomainError("FORBIDDEN");
}
