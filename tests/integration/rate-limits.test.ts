import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, messages, reports } from "@/db/schema";
import { requestBooking } from "@/server/bookings/service";
import { postMessage } from "@/server/messages/service";
import { createReport } from "@/server/reports/service";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("limites anti-abus", () => {
  it("bloque la 11e demande en 24 h sans rien créer, et ignore les demandes plus anciennes", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const old = await makeMeal(host.userId);
    const oldBooking = await makeBooking(old.id, student.userId, "declined");
    await db.update(bookings).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(bookings.id, oldBooking.id));
    for (let i = 0; i < 10; i++) {
      const meal = await makeMeal(host.userId, { title: `Repas ${i}` });
      await requestBooking(db, student, meal.id, {});
    }
    const eleventh = await makeMeal(host.userId);
    await expect(requestBooking(db, student, eleventh.id, {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await db.select().from(bookings).where(eq(bookings.mealId, eleventh.id))).toHaveLength(0);
  });

  it("bloque le 31e message en une minute", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    await db.insert(messages).values(Array.from({ length: 30 }, (_, i) => ({ bookingId: booking.id, senderId: student.userId, body: `m${i}` })));
    await expect(postMessage(db, student, booking.id, { body: "encore" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await postMessage(db, host, booking.id, { body: "l'hôte peut encore écrire" });
  });

  it("bloque le 6e signalement en 24 h", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    await db.insert(reports).values(Array.from({ length: 5 }, () => ({ reporterId: student.userId, reportedUserId: host.userId, bookingId: booking.id, reason: "Signalement de test" })));
    await expect(createReport(db, student, booking.id, { reason: "Encore un signalement" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("bloque le 4e envoi de carte en 24 h", async () => {
    const storage = createMemoryStorage();
    const userId = await makeAuthUser("chloe@gmail.com");
    let student = await makeProfile({ userId, verificationStatus: "none" });
    const { reviewCard } = await import("@/server/verification/service");
    const admin = await makeProfile({ role: "admin" });
    for (let i = 0; i < 3; i++) {
      const { id } = await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
      await reviewCard(db, storage, admin, id, "reject", { reason: "Illisible" });
      student = { ...student, verificationStatus: "rejected" };
    }
    await expect(
      submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(storage.objects.size).toBe(0);
  });
});
