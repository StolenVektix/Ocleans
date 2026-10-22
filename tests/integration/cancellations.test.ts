import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals } from "@/db/schema";
import { loadBookingContext } from "@/server/bookings/context";
import { cancelBooking, decideBooking, requestBooking } from "@/server/bookings/service";
import { cancelMeal, getMealForViewer, listUpcomingMeals } from "@/server/meals/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("loadBookingContext", () => {
  it("rassemble hôte, étudiant, statut et repas, ou renvoie null", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile({ firstName: "Léa" });
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    expect(await loadBookingContext(db, booking.id)).toMatchObject({
      bookingId: booking.id,
      hostId: host.userId,
      studentId: student.userId,
      bookingStatus: "accepted",
      mealTitle: "Gratin dauphinois",
      hostFirstName: "Mireille",
      studentFirstName: "Léa",
      meal: { hostId: host.userId, status: "open", seatsTotal: 2 },
    });
    expect(await loadBookingContext(db, "abc")).toBeNull();
    expect(await loadBookingContext(db, crypto.randomUUID())).toBeNull();
  });
});

describe("cancelMeal", () => {
  it("annule le repas et ses demandes en attente ou acceptées, avec le motif", async () => {
    const host = await makeProfile({ role: "host" });
    const [s1, s2, s3] = [await makeProfile(), await makeProfile(), await makeProfile()];
    const meal = await makeMeal(host.userId, { seatsTotal: 3 });
    const accepted = await makeBooking(meal.id, s1.userId, "accepted");
    const pending = await makeBooking(meal.id, s2.userId, "pending");
    const declined = await makeBooking(meal.id, s3.userId, "declined");
    await cancelMeal(db, host, meal.id, { reason: "  Imprévu familial " });
    const [m] = await db.select().from(meals).where(eq(meals.id, meal.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: "Imprévu familial" });
    const rows = Object.fromEntries((await db.select().from(bookings)).map((b) => [b.id, b]));
    expect(rows[accepted.id]).toMatchObject({ status: "cancelled", cancelledBy: host.userId, cancelReason: "Imprévu familial" });
    expect(rows[pending.id].status).toBe("cancelled");
    expect(rows[declined.id].status).toBe("declined");
    expect(await listUpcomingMeals(db, {})).toHaveLength(0);
  });

  it("refuse sans motif, par un autre hôte, sur un repas commencé ou déjà annulé", async () => {
    const host = await makeProfile({ role: "host" });
    const other = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId);
    const started = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    await expect(cancelMeal(db, host, meal.id, { reason: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(cancelMeal(db, other, meal.id, { reason: "Pas à moi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelMeal(db, host, started.id, { reason: "Trop tard" })).rejects.toMatchObject({ code: "MEAL_STARTED" });
    await cancelMeal(db, host, meal.id, { reason: "Imprévu" });
    await expect(cancelMeal(db, host, meal.id, { reason: "Encore" })).rejects.toMatchObject({ code: "MEAL_CANCELLED" });
    await expect(cancelMeal(db, host, "abc", { reason: "Imprévu" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cancelBooking", () => {
  it("libère la place d'un étudiant accepté, que l'hôte peut redonner", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const b1 = await makeBooking(meal.id, s1.userId, "accepted");
    const b2 = await makeBooking(meal.id, s2.userId, "pending");
    await cancelBooking(db, s1, b1.id, { reason: "Partiel déplacé" });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b1.id));
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: s1.userId, cancelReason: "Partiel déplacé" });
    expect((await getMealForViewer(db, null, meal.id))?.seatsLeft).toBe(1);
    await expect(decideBooking(db, host, b2.id, "accept")).resolves.toEqual({ status: "accepted" });
  });

  it("refuse l'hôte, un autre étudiant, une demande refusée, un repas commencé", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const other = await makeProfile();
    const meal = await makeMeal(host.userId);
    const started = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    const declined = await makeBooking((await makeMeal(host.userId)).id, student.userId, "declined");
    const late = await makeBooking(started.id, student.userId, "accepted");
    await expect(cancelBooking(db, host, booking.id, { reason: "Non" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelBooking(db, other, booking.id, { reason: "Non" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelBooking(db, student, declined.id, { reason: "Tant pis" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(cancelBooking(db, student, late.id, { reason: "Trop tard" })).rejects.toMatchObject({ code: "MEAL_STARTED" });
  });

  it("n'autorise pas une nouvelle demande pour le même repas", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "pending");
    await cancelBooking(db, student, booking.id, { reason: "Changement de plan" });
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });
  });
});
