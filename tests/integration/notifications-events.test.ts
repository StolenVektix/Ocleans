import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, notifications } from "@/db/schema";
import { cancelBooking, decideBooking, requestBooking } from "@/server/bookings/service";
import { cancelMeal } from "@/server/meals/service";
import { createReport, resolveReport } from "@/server/reports/service";
import { reviewCard, submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

async function inbox(userId: string) {
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

beforeEach(resetDb);
afterAll(closeDb);

describe("notifications des réservations", () => {
  it("prévient l'hôte d'une demande, puis l'étudiant de l'acceptation, sans adresse", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile({ firstName: "Léa" });
    const meal = await makeMeal(host.userId, { title: "Blanquette" });
    const { id } = await requestBooking(db, student, meal.id, { message: "Bonjour" });
    const [forHost] = await inbox(host.userId);
    expect(forHost).toMatchObject({ type: "booking_requested", link: "/hote/offres", emailStatus: "pending" });
    expect(forHost.body).toContain("Léa");
    expect(forHost.body).toContain("Blanquette");

    await decideBooking(db, host, id, "accept");
    const [forStudent] = await inbox(student.userId);
    expect(forStudent).toMatchObject({ type: "booking_accepted", link: "/etudiant/mes-repas" });
    expect(`${forStudent.title} ${forStudent.body}`).not.toContain("rue Notre-Dame");
  });

  it("prévient l'étudiant d'un refus et l'hôte d'une annulation de venue, avec le motif", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile({ firstName: "Karim" });
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId);
    const b1 = await makeBooking(meal.id, s1.userId, "accepted");
    const b2 = await makeBooking(meal.id, s2.userId, "pending");
    await decideBooking(db, host, b2.id, "decline");
    expect((await inbox(s2.userId))[0].type).toBe("booking_declined");
    await cancelBooking(db, s1, b1.id, { reason: "Partiel déplacé" });
    const [forHost] = await inbox(host.userId);
    expect(forHost.type).toBe("booking_cancelled");
    expect(forHost.body).toContain("Karim");
    expect(forHost.body).toContain("Partiel déplacé");
  });

  it("prévient seulement les étudiants concernés quand l'hôte annule un repas", async () => {
    const host = await makeProfile({ role: "host" });
    const [accepted, pending, declined] = [await makeProfile(), await makeProfile(), await makeProfile()];
    const meal = await makeMeal(host.userId, { seatsTotal: 3, title: "Couscous" });
    await makeBooking(meal.id, accepted.userId, "accepted");
    await makeBooking(meal.id, pending.userId, "pending");
    await makeBooking(meal.id, declined.userId, "declined");
    await cancelMeal(db, host, meal.id, { reason: "Four en panne" });
    for (const s of [accepted, pending]) {
      const [n] = await inbox(s.userId);
      expect(n).toMatchObject({ type: "meal_cancelled" });
      expect(n.body).toContain("Four en panne");
    }
    expect(await inbox(declined.userId)).toHaveLength(0);
    expect(await inbox(host.userId)).toHaveLength(0);
  });

  it("ne crée aucune notification quand l'action échoue", async () => {
    const host = await makeProfile({ role: "host" });
    const unverified = await makeProfile({ verificationStatus: "none" });
    const meal = await makeMeal(host.userId);
    await expect(requestBooking(db, unverified, meal.id, {})).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});

describe("notifications de modération et de vérification", () => {
  it("prévient l'autre participant d'une annulation par l'équipe, et enregistre l'admin comme auteur", async () => {
    const admin = await makeProfile({ role: "admin" });
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    const { id } = await createReport(db, host, booking.id, { reason: "Comportement inacceptable" });
    await resolveReport(db, admin, id, "suspend");
    const [n] = await inbox(host.userId);
    expect(n).toMatchObject({ type: "cancelled_by_team", link: "/hote/offres" });
    expect(`${n.title} ${n.body}`).not.toMatch(/suspen|signal/i);
    expect(await inbox(student.userId)).toHaveLength(0);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.cancelledBy).toBe(admin.userId);
  });

  it("prévient l'étudiant du résultat de la vérification de sa carte", async () => {
    const storage = createMemoryStorage();
    const adminId = await makeAuthUser("admin@example.com");
    const admin = await makeProfile({ userId: adminId, role: "admin" });
    const userId = await makeAuthUser("chloe@gmail.com");
    const student = await makeProfile({ userId, verificationStatus: "none" });
    const { id } = await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
    await reviewCard(db, storage, admin, id, "reject", { reason: "Photo floue" });
    const [n] = await inbox(student.userId);
    expect(n).toMatchObject({ type: "verification_rejected", link: "/etudiant/verification" });
    expect(n.body).toContain("Photo floue");
  });
});
