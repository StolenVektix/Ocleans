import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { messages } from "@/db/schema";
import { cancelBooking } from "@/server/bookings/service";
import { getThread, postMessage } from "@/server/messages/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function acceptedBooking(mealOverrides: Parameters<typeof makeMeal>[1] = {}) {
  const host = await makeProfile({ role: "host", firstName: "Mireille" });
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(host.userId, mealOverrides);
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { host, student, meal, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("messagerie", () => {
  it("permet aux deux participants d'échanger, dans l'ordre, et cache tout à un tiers", async () => {
    const { host, student, booking } = await acceptedBooking();
    await postMessage(db, student, booking.id, { body: "  Bonjour Mireille ! " });
    await postMessage(db, host, booking.id, { body: "Bienvenue Léa" });
    const thread = await getThread(db, student, booking.id);
    expect(thread).toMatchObject({ otherFirstName: "Mireille", mealTitle: "Gratin dauphinois", canWrite: true });
    expect(thread?.messages.map((m) => [m.body, m.mine, m.senderFirstName])).toEqual([
      ["Bonjour Mireille !", true, "Léa"],
      ["Bienvenue Léa", false, "Mireille"],
    ]);
    const outsider = await makeProfile();
    expect(await getThread(db, outsider, booking.id)).toBeNull();
    await expect(postMessage(db, outsider, booking.id, { body: "Coucou" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getThread(db, student, "abc")).toBeNull();
  });

  it("n'ouvre pas de conversation sur une demande en attente", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "pending");
    expect(await getThread(db, student, booking.id)).toBeNull();
    await expect(postMessage(db, student, booking.id, { body: "Bonjour" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passe en lecture seule après une annulation, historique conservé", async () => {
    const { student, booking } = await acceptedBooking();
    await postMessage(db, student, booking.id, { body: "À samedi !" });
    await cancelBooking(db, student, booking.id, { reason: "Malade" });
    const thread = await getThread(db, student, booking.id);
    expect(thread?.canWrite).toBe(false);
    expect(thread?.messages).toHaveLength(1);
    await expect(postMessage(db, student, booking.id, { body: "Désolée" })).rejects.toMatchObject({ code: "THREAD_CLOSED" });
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("reste ouverte 7 jours après le repas, puis se ferme", async () => {
    const recent = await acceptedBooking({ startsAt: new Date(Date.now() - 6 * DAY) });
    expect((await getThread(db, recent.student, recent.booking.id))?.canWrite).toBe(true);
    const old = await acceptedBooking({ startsAt: new Date(Date.now() - 8 * DAY) });
    expect((await getThread(db, old.host, old.booking.id))?.canWrite).toBe(false);
    await expect(postMessage(db, old.host, old.booking.id, { body: "Merci encore" })).rejects.toMatchObject({ code: "THREAD_CLOSED" });
  });

  it("refuse un message vide ou trop long", async () => {
    const { student, booking } = await acceptedBooking();
    await expect(postMessage(db, student, booking.id, { body: "   " })).rejects.toBeInstanceOf(ZodError);
    await expect(postMessage(db, student, booking.id, { body: "x".repeat(1001) })).rejects.toBeInstanceOf(ZodError);
  });
});
