import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("schéma", () => {
  it("enregistre un profil, un repas et une réservation", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId, { dietTags: ["halal"] });
    const booking = await makeBooking(meal.id, student.userId);
    expect(meal.dietTags).toEqual(["halal"]);
    expect(meal.status).toBe("open");
    expect(booking.status).toBe("pending");
  });

  it("interdit deux demandes du même étudiant pour un repas", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    await makeBooking(meal.id, student.userId);
    await expect(makeBooking(meal.id, student.userId)).rejects.toThrow();
  });
});
