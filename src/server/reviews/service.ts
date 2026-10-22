import { and, avg, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { reviews } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { assertCanReview, otherParticipantId, participantRole } from "@/domain/interactions";
import type { Rating } from "@/domain/types";
import { loadBookingContext } from "@/server/bookings/context";

const reviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Choisissez une note" })
    .int("Choisissez une note")
    .min(1, "Choisissez une note de 1 à 5")
    .max(5, "Choisissez une note de 1 à 5"),
  comment: z.string().trim().max(500, "500 caractères maximum").default(""),
});

export interface ReviewPrompt {
  bookingId: string;
  mealTitle: string;
  otherFirstName: string;
  allowed: boolean;
  alreadyReviewed: boolean;
  reason: string | null;
}

async function hasReviewed(db: Db, authorId: string, bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.bookingId, bookingId), eq(reviews.authorId, authorId)))
    .limit(1);
  return Boolean(row);
}

export async function submitReview(
  db: Db,
  actor: Actor,
  bookingId: string,
  raw: { rating?: unknown; comment?: unknown },
  now = new Date(),
): Promise<void> {
  const input = reviewSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  assertCanReview({ actor, ctx, alreadyReviewed: await hasReviewed(db, actor.userId, bookingId), now });
  try {
    await db.insert(reviews).values({
      bookingId,
      authorId: actor.userId,
      targetId: otherParticipantId(actor, ctx),
      rating: input.rating,
      comment: input.comment,
    });
  } catch (error) {
    // Double envoi simultané : la contrainte d'unicité tranche.
    if (isUniqueViolation(error)) throw new DomainError("ALREADY_REVIEWED");
    throw error;
  }
}

export async function getRatings(db: Db, userIds: string[]): Promise<Map<string, Rating>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ targetId: reviews.targetId, average: avg(reviews.rating), count: count() })
    .from(reviews)
    .where(inArray(reviews.targetId, [...new Set(userIds)]))
    .groupBy(reviews.targetId);
  return new Map(rows.map((r) => [r.targetId, { average: Math.round(Number(r.average) * 10) / 10, count: Number(r.count) }]));
}

export async function reviewedBookingIds(db: Db, authorId: string, bookingIds: string[]): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();
  const rows = await db
    .select({ bookingId: reviews.bookingId })
    .from(reviews)
    .where(and(eq(reviews.authorId, authorId), inArray(reviews.bookingId, bookingIds)));
  return new Set(rows.map((r) => r.bookingId));
}

export async function getReviewPrompt(db: Db, actor: Actor, bookingId: string, now = new Date()): Promise<ReviewPrompt | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || participantRole(actor, ctx) === null) return null;
  let reason: string | null = null;
  const alreadyReviewed = await hasReviewed(db, actor.userId, bookingId);
  try {
    assertCanReview({ actor, ctx, alreadyReviewed, now });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    reason = error.message;
  }
  return {
    bookingId: ctx.bookingId,
    mealTitle: ctx.mealTitle,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
    allowed: reason === null,
    alreadyReviewed,
    reason,
  };
}
