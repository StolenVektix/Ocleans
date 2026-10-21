import { DomainError } from "./errors";
import type { BookingStatus, MealStatus, Role, VerificationStatus } from "./types";

export interface Actor {
  userId: string;
  role: Role;
  verificationStatus: VerificationStatus;
  suspended: boolean;
}

export interface MealState {
  hostId: string;
  status: MealStatus;
  startsAt: Date;
  seatsTotal: number;
}

export function seatsLeft(seatsTotal: number, acceptedCount: number): number {
  return Math.max(0, seatsTotal - acceptedCount);
}

export function assertActive(actor: Actor): void {
  if (actor.suspended) throw new DomainError("SUSPENDED");
}

export function assertCanCreateMeal(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "host") throw new DomainError("FORBIDDEN");
}

function assertMealOpen(meal: MealState, now: Date): void {
  if (meal.status === "cancelled") throw new DomainError("MEAL_CANCELLED");
  if (meal.startsAt.getTime() <= now.getTime()) throw new DomainError("MEAL_STARTED");
}

export function assertCanEditMeal(args: {
  actor: Actor;
  meal: MealState;
  newSeatsTotal: number;
  acceptedCount: number;
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  assertMealOpen(args.meal, args.now);
  if (args.newSeatsTotal < args.acceptedCount) throw new DomainError("SEATS_BELOW_ACCEPTED");
}

export function assertCanRequest(args: {
  actor: Actor;
  meal: MealState;
  acceptedCount: number;
  alreadyRequested: boolean;
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.role !== "student") throw new DomainError("FORBIDDEN");
  if (args.actor.verificationStatus !== "verified") throw new DomainError("NOT_VERIFIED");
  assertMealOpen(args.meal, args.now);
  if (args.alreadyRequested) throw new DomainError("ALREADY_REQUESTED");
  if (seatsLeft(args.meal.seatsTotal, args.acceptedCount) === 0) throw new DomainError("MEAL_FULL");
}

export function assertCanDecide(args: {
  actor: Actor;
  meal: MealState;
  bookingStatus: BookingStatus;
  acceptedCount: number;
  decision: "accept" | "decline";
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  if (args.bookingStatus !== "pending") throw new DomainError("INVALID_TRANSITION");
  assertMealOpen(args.meal, args.now);
  if (args.decision === "accept" && seatsLeft(args.meal.seatsTotal, args.acceptedCount) === 0) {
    throw new DomainError("MEAL_FULL");
  }
}

export function canSeeAddress(args: {
  viewerId: string | null;
  hostId: string;
  viewerBookingStatus: BookingStatus | null;
}): boolean {
  if (!args.viewerId) return false;
  return args.viewerId === args.hostId || args.viewerBookingStatus === "accepted";
}
