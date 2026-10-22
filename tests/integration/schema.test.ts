import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { verifications } from "@/db/schema";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

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

  it("enregistre une demande de vérification par carte en attente", async () => {
    const student = await makeProfile({ verificationStatus: "none" });
    const [row] = await db
      .insert(verifications)
      .values({ userId: student.userId, method: "card", school: "Bordeaux INP", studentNumber: "21456789", cardObjectKey: "cards/x.jpg" })
      .returning();
    expect(row).toMatchObject({ status: "pending", reviewedAt: null, rejectionReason: null });
  });
});
