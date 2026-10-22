import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { reviews } from "@/db/schema";
import { getRatings, getReviewPrompt, reviewedBookingIds, submitReview } from "@/server/reviews/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function pastBooking(host?: Awaited<ReturnType<typeof makeProfile>>) {
  const h = host ?? (await makeProfile({ role: "host", firstName: "Mireille" }));
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(h.userId, { startsAt: new Date(Date.now() - DAY) });
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { host: h, student, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("submitReview", () => {
  it("permet à chacun de noter l'autre une fois après le repas", async () => {
    const { host, student, booking } = await pastBooking();
    await submitReview(db, student, booking.id, { rating: "5", comment: " Super soirée " });
    await submitReview(db, host, booking.id, { rating: "4" });
    const rows = await db.select().from(reviews);
    expect(rows.find((r) => r.authorId === student.userId)).toMatchObject({ targetId: host.userId, rating: 5, comment: "Super soirée" });
    expect(rows.find((r) => r.authorId === host.userId)).toMatchObject({ targetId: student.userId, rating: 4, comment: "" });
    await expect(submitReview(db, student, booking.id, { rating: "3" })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
    expect(await reviewedBookingIds(db, student.userId, [booking.id])).toEqual(new Set([booking.id]));
  });

  it("refuse avant le repas, sur une demande non acceptée et pour un tiers", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const future = await makeBooking((await makeMeal(host.userId)).id, student.userId, "accepted");
    const declined = await makeBooking((await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) })).id, student.userId, "declined");
    await expect(submitReview(db, student, future.id, { rating: "5" })).rejects.toMatchObject({ code: "REVIEW_TOO_EARLY" });
    await expect(submitReview(db, student, declined.id, { rating: "5" })).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
    const { booking } = await pastBooking();
    await expect(submitReview(db, student, booking.id, { rating: "5" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(submitReview(db, student, "abc", { rating: "5" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("n'enregistre qu'un avis en cas de double envoi simultané", async () => {
    const { student, booking } = await pastBooking();
    const results = await Promise.allSettled([
      submitReview(db, student, booking.id, { rating: "5" }),
      submitReview(db, student, booking.id, { rating: "5" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ALREADY_REVIEWED" });
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("refuse une note hors de 1 à 5 ou un commentaire trop long", async () => {
    const { student, booking } = await pastBooking();
    await expect(submitReview(db, student, booking.id, { rating: "0" })).rejects.toBeInstanceOf(ZodError);
    await expect(submitReview(db, student, booking.id, { rating: "6" })).rejects.toBeInstanceOf(ZodError);
    await expect(submitReview(db, student, booking.id, { rating: "4", comment: "x".repeat(501) })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getRatings", () => {
  it("calcule la moyenne et le nombre d'avis reçus", async () => {
    const first = await pastBooking();
    const second = await pastBooking(first.host);
    await submitReview(db, first.student, first.booking.id, { rating: "5" });
    await submitReview(db, second.student, second.booking.id, { rating: "4" });
    const ratings = await getRatings(db, [first.host.userId, first.student.userId]);
    expect(ratings.get(first.host.userId)).toEqual({ average: 4.5, count: 2 });
    expect(ratings.has(first.student.userId)).toBe(false);
    expect((await getRatings(db, [])).size).toBe(0);
  });
});

describe("getReviewPrompt", () => {
  it("explique pourquoi l'avis n'est pas encore possible", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile();
    const future = await makeBooking((await makeMeal(host.userId)).id, student.userId, "accepted");
    expect(await getReviewPrompt(db, student, future.id)).toMatchObject({
      otherFirstName: "Mireille",
      allowed: false,
      reason: "Vous pourrez laisser un avis une fois le repas passé.",
    });
    const { booking } = await pastBooking();
    expect(await getReviewPrompt(db, student, booking.id)).toBeNull();
  });
});
