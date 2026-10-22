import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelMeal, getMealForViewer, listHostMeals, listUpcomingMeals } from "@/server/meals/service";
import { listStudentBookings } from "@/server/bookings/service";
import { submitReview } from "@/server/reviews/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

beforeEach(resetDb);
afterAll(closeDb);

describe("listStudentBookings", () => {
  it("indique pour chaque réservation les actions possibles et le motif d'annulation", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const upcoming = await makeBooking((await makeMeal(host.userId, { title: "À venir" })).id, student.userId, "accepted");
    await makeBooking((await makeMeal(host.userId, { title: "En attente" })).id, student.userId, "pending");
    const past = await makeBooking((await makeMeal(host.userId, { title: "Passé", startsAt: new Date(Date.now() - DAY) })).id, student.userId, "accepted");
    const cancelledMeal = await makeMeal(host.userId, { title: "Annulé" });
    await makeBooking(cancelledMeal.id, student.userId, "accepted");
    await cancelMeal(db, host, cancelledMeal.id, { reason: "Four en panne" });

    const byTitle = async () => Object.fromEntries((await listStudentBookings(db, student)).map((b) => [b.meal.title, b]));
    let list = await byTitle();
    expect(list["À venir"].actions).toEqual({ cancel: true, messages: true, review: false, report: true });
    expect(list["En attente"].actions).toEqual({ cancel: true, messages: false, review: false, report: true });
    expect(list["Passé"].actions).toEqual({ cancel: false, messages: true, review: true, report: true });
    expect(list["Annulé"]).toMatchObject({ status: "cancelled", cancelReason: "Four en panne" });
    expect(list["Annulé"].actions).toMatchObject({ cancel: false, messages: true, review: false });

    await submitReview(db, student, past.id, { rating: "5" });
    list = await byTitle();
    expect(list["Passé"].actions.review).toBe(false);
    expect(list["À venir"].id).toBe(upcoming.id);
  });
});

describe("listHostMeals", () => {
  it("donne à l'hôte la note des étudiants, les motifs et les actions", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile({ firstName: "Léa" });
    const otherHost = await makeProfile({ role: "host" });
    const pastWithOther = await makeBooking((await makeMeal(otherHost.userId, { startsAt: new Date(Date.now() - 2 * DAY) })).id, student.userId, "accepted");
    await submitReview(db, otherHost, pastWithOther.id, { rating: "4", comment: "Très ponctuelle" });

    const upcoming = await makeMeal(host.userId, { title: "Prochain" });
    await makeBooking(upcoming.id, student.userId, "accepted");
    const pastMeal = await makeMeal(host.userId, { title: "Ancien", startsAt: new Date(Date.now() - DAY) });
    await makeBooking(pastMeal.id, student.userId, "accepted");

    const meals = Object.fromEntries((await listHostMeals(db, host)).map((m) => [m.title, m]));
    expect(meals["Prochain"].canCancel).toBe(true);
    expect(meals["Ancien"].canCancel).toBe(false);
    expect(meals["Prochain"].requests[0]).toMatchObject({
      studentRating: { average: 4, count: 1 },
      cancelReason: null,
      actions: { messages: true, review: false, report: true },
    });
    expect(meals["Ancien"].requests[0].actions.review).toBe(true);
    expect(meals["Prochain"].requests[0].studentReviews.map((r) => r.comment)).toEqual(["Très ponctuelle"]);
  });
});

describe("notes publiques", () => {
  it("affiche la note moyenne de l'hôte dans la liste et la fiche", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const past = await makeBooking((await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) })).id, student.userId, "accepted");
    await submitReview(db, student, past.id, { rating: "5" });
    const meal = await makeMeal(host.userId);
    const [listed] = await listUpcomingMeals(db, {});
    expect(listed.hostRating).toEqual({ average: 5, count: 1 });
    expect((await getMealForViewer(db, null, meal.id))?.hostRating).toEqual({ average: 5, count: 1 });
    const newHost = await makeProfile({ role: "host" });
    const fresh = await makeMeal(newHost.userId);
    expect((await getMealForViewer(db, null, fresh.id))?.hostRating).toBeNull();
  });
});
