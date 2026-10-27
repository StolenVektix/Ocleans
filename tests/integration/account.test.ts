import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals, messages, notifications, profiles, reviews, verifications } from "@/db/schema";
import { ACCOUNT_DELETED_REASON, DELETED_FIRST_NAME, deleteAccount } from "@/server/account/service";
import { getThread } from "@/server/messages/service";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600_000;
const authUserExists = async (id: string) =>
  (await db.execute(sql`select 1 from neon_auth."user" where id::text = ${id}`)).rows.length > 0;

beforeEach(resetDb);
afterAll(closeDb);

describe("deleteAccount", () => {
  it("exige de taper SUPPRIMER", async () => {
    const userId = await makeAuthUser("a@example.com");
    const p = await makeProfile({ userId });
    await expect(deleteAccount(db, createMemoryStorage(), p, { confirmation: "supprimer" })).rejects.toBeInstanceOf(ZodError);
    expect(await authUserExists(userId)).toBe(true);
  });

  it("anonymise un hôte, annule ses repas à venir en prévenant les étudiants, et garde ses messages lisibles", async () => {
    const hostId = await makeAuthUser("mireille@example.com");
    const host = await makeProfile({ userId: hostId, role: "host", firstName: "Mireille", bio: "Ancienne prof" });
    const student = await makeProfile({ firstName: "Léa" });
    const future = await makeMeal(host.userId, { title: "Blanquette" });
    const past = await makeMeal(host.userId, { title: "Pot-au-feu", startsAt: new Date(Date.now() - DAY) });
    const futureBooking = await makeBooking(future.id, student.userId, "accepted");
    const pastBooking = await makeBooking(past.id, student.userId, "accepted");
    await db.insert(messages).values({ bookingId: pastBooking.id, senderId: host.userId, body: "Merci pour la soirée" });
    await db.insert(reviews).values({ bookingId: pastBooking.id, authorId: host.userId, targetId: student.userId, rating: 5, comment: "Super" });
    await db.insert(notifications).values({ userId: host.userId, type: "reminder", title: "x", body: "y", link: "/" });

    await deleteAccount(db, createMemoryStorage(), host, { confirmation: "SUPPRIMER" });

    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p).toMatchObject({ firstName: DELETED_FIRST_NAME, bio: "", school: null, suspended: true });
    expect(p.deletedAt).not.toBeNull();
    expect(await authUserExists(hostId)).toBe(false);
    const [m] = await db.select().from(meals).where(eq(meals.id, future.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, futureBooking.id));
    expect(b.status).toBe("cancelled");
    const [pm] = await db.select().from(meals).where(eq(meals.id, past.id));
    expect(pm.status).toBe("open");
    const studentInbox = await db.select().from(notifications).where(eq(notifications.userId, student.userId));
    expect(studentInbox.map((n) => n.type)).toEqual(["meal_cancelled"]);
    expect(await db.select().from(notifications).where(eq(notifications.userId, host.userId))).toHaveLength(0);
    const thread = await getThread(db, student, pastBooking.id);
    expect(thread?.otherFirstName).toBe(DELETED_FIRST_NAME);
    expect(thread?.messages[0]).toMatchObject({ body: "Merci pour la soirée", senderFirstName: DELETED_FIRST_NAME });
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("efface les données de vérification d'un étudiant, photo comprise, et annule ses demandes à venir", async () => {
    const storage = createMemoryStorage();
    const userId = await makeAuthUser("chloe@gmail.com");
    const student = await makeProfile({ userId, verificationStatus: "none", school: "KEDGE" });
    await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
    const host = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId, { title: "Couscous" });
    const booking = await makeBooking(meal.id, student.userId, "pending");

    await deleteAccount(db, storage, { ...student, verificationStatus: "pending" }, { confirmation: "SUPPRIMER" });

    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(verifications)).toHaveLength(0);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON });
    const [hostNote] = await db.select().from(notifications).where(eq(notifications.userId, host.userId));
    expect(hostNote).toMatchObject({ type: "booking_cancelled" });
    expect(hostNote.body).toContain("Couscous");
    expect(hostNote.body).not.toContain("Test");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, student.userId));
    expect(p).toMatchObject({ firstName: DELETED_FIRST_NAME, school: null, verificationStatus: "none" });
  });
});
