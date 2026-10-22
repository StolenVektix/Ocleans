import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings } from "@/db/schema";
import { decideBooking, listStudentBookings, requestBooking } from "@/server/bookings/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("requestBooking", () => {
  it("crée une demande en attente pour un étudiant vérifié", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const { id } = await requestBooking(db, student, meal.id, { message: "Bonjour, avec plaisir !" });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row).toMatchObject({ status: "pending", requestMessage: "Bonjour, avec plaisir !" });
  });

  it("refuse un étudiant non vérifié, un repas passé, un repas complet, un id invalide", async () => {
    const host = await makeProfile({ role: "host" });
    const unverified = await makeProfile({ verificationStatus: "none" });
    const student = await makeProfile();
    const other = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const past = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    await expect(requestBooking(db, unverified, meal.id, {})).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await expect(requestBooking(db, student, past.id, {})).rejects.toMatchObject({ code: "MEAL_STARTED" });
    await makeBooking(meal.id, other.userId, "accepted");
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "MEAL_FULL" });
    await expect(requestBooking(db, student, "abc", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuse une deuxième demande, y compris en double-clic simultané", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const results = await Promise.allSettled([
      requestBooking(db, student, meal.id, {}),
      requestBooking(db, student, meal.id, {}),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ALREADY_REQUESTED" });
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });
  });

  it("refuse un message trop long", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    await expect(requestBooking(db, student, meal.id, { message: "x".repeat(501) })).rejects.toThrow();
  });
});

describe("decideBooking", () => {
  it("permet à l'hôte d'accepter puis interdit une seconde décision", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId);
    expect(await decideBooking(db, host, booking.id, "accept")).toEqual({ status: "accepted" });
    await expect(decideBooking(db, host, booking.id, "decline")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("refuse un autre hôte", async () => {
    const host = await makeProfile({ role: "host" });
    const intruder = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId);
    await expect(decideBooking(db, intruder, booking.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("n'accepte jamais plus d'étudiants que de places, même en simultané", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const b1 = await makeBooking(meal.id, s1.userId);
    const b2 = await makeBooking(meal.id, s2.userId);
    const results = await Promise.allSettled([
      decideBooking(db, host, b1.id, "accept"),
      decideBooking(db, host, b2.id, "accept"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "MEAL_FULL" });
    const accepted = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.mealId, meal.id), eq(bookings.status, "accepted")));
    expect(accepted).toHaveLength(1);
  });
});

describe("listStudentBookings", () => {
  it("donne l'adresse uniquement pour les réservations acceptées", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile();
    const m1 = await makeMeal(host.userId, { title: "Accepté" });
    const m2 = await makeMeal(host.userId, { title: "En attente" });
    await makeBooking(m1.id, student.userId, "accepted");
    await makeBooking(m2.id, student.userId, "pending");
    const list = await listStudentBookings(db, student);
    const byTitle = Object.fromEntries(list.map((b) => [b.meal.title, b]));
    expect(byTitle["Accepté"].meal.address).toBe("12 rue Notre-Dame, 33000 Bordeaux");
    expect(byTitle["En attente"].meal.address).toBeNull();
    expect(byTitle["Accepté"].meal.hostFirstName).toBe("Mireille");
  });
});
