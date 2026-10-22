import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { countUnread, ensureReminders, listNotifications, markAllRead, queueNotifications } from "@/server/notifications/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const HOUR = 3600 * 1000;

beforeEach(resetDb);
afterAll(closeDb);

describe("notifications", () => {
  it("liste les notifications d'un utilisateur, compte les non lues et les marque lues", async () => {
    const user = await makeProfile();
    const other = await makeProfile();
    await queueNotifications(db, [
      { userId: user.userId, type: "booking_accepted", title: "Demande acceptée", body: "Mireille vous attend.", link: "/etudiant/mes-repas" },
      { userId: user.userId, type: "booking_declined", title: "Demande refusée", body: "Désolé.", link: "/repas" },
      { userId: other.userId, type: "booking_requested", title: "Nouvelle demande", body: "…", link: "/hote/offres" },
    ]);
    expect(await countUnread(db, user.userId)).toBe(2);
    const list = await listNotifications(db, user.userId);
    expect(list.map((n) => n.title).sort()).toEqual(["Demande acceptée", "Demande refusée"]);
    expect(list.every((n) => !n.read)).toBe(true);
    await markAllRead(db, user.userId);
    expect(await countUnread(db, user.userId)).toBe(0);
    expect(await countUnread(db, other.userId)).toBe(1);
    await queueNotifications(db, []);
  });

  it("ignore un doublon de clé de déduplication sans erreur", async () => {
    const user = await makeProfile();
    const item = { userId: user.userId, type: "reminder" as const, title: "Rappel", body: "Demain", link: "/", dedupeKey: "k1" };
    await queueNotifications(db, [item]);
    await queueNotifications(db, [item]);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });
});

describe("ensureReminders", () => {
  it("crée un rappel pour l'hôte et l'étudiant accepté d'un repas du lendemain, une seule fois", async () => {
    const now = new Date("2026-10-22T08:00:00Z");
    const at = (h: number) => new Date(now.getTime() + h * HOUR);
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const accepted = await makeProfile({ firstName: "Léa" });
    const pending = await makeProfile();
    const soon = await makeMeal(host.userId, { title: "Blanquette", startsAt: at(20) });
    const later = await makeMeal(host.userId, { startsAt: at(40) }); // 24 octobre, 2 h à Paris : surlendemain
    const cancelled = await makeMeal(host.userId, { startsAt: at(10), status: "cancelled" });
    await makeBooking(soon.id, accepted.userId, "accepted");
    await makeBooking(soon.id, pending.userId, "pending");
    await makeBooking(later.id, accepted.userId, "accepted");
    await makeBooking(cancelled.id, pending.userId, "accepted");

    expect(await ensureReminders(db, { now })).toBe(2);
    expect(await ensureReminders(db, { now })).toBe(0);
    const forStudent = await listNotifications(db, accepted.userId);
    expect(forStudent).toHaveLength(1);
    expect(forStudent[0]).toMatchObject({ type: "reminder", link: "/etudiant/mes-repas" });
    expect(forStudent[0].body).toContain("Blanquette");
    expect(forStudent[0].body).toContain("Mireille");
    const forHost = await listNotifications(db, host.userId);
    expect(forHost[0]).toMatchObject({ type: "reminder", link: "/hote/offres" });
    expect(forHost[0].body).toContain("Léa");
    expect(await countUnread(db, pending.userId)).toBe(0);
  });

  it("peut se limiter à un utilisateur et résiste aux appels simultanés", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 2, startsAt: new Date(Date.now() + 5 * HOUR) });
    await makeBooking(meal.id, s1.userId, "accepted");
    await makeBooking(meal.id, s2.userId, "accepted");
    expect(await ensureReminders(db, { userId: s1.userId })).toBe(1);
    expect(await countUnread(db, s2.userId)).toBe(0);
    const results = await Promise.all([ensureReminders(db, { userId: s2.userId }), ensureReminders(db, { userId: s2.userId })]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await countUnread(db, s2.userId)).toBe(1);
  });

  it("rappelle la veille au matin un dîner du lendemain, mais pas un repas du surlendemain", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile();
    const cronRun = new Date("2026-10-22T07:00:00Z"); // 9 h à Paris
    const tomorrowDinner = await makeMeal(host.userId, { title: "Dîner du 23", startsAt: new Date("2026-10-23T17:00:00Z") });
    const dayAfter = await makeMeal(host.userId, { title: "Déjeuner du 24", startsAt: new Date("2026-10-24T10:30:00Z") });
    await makeBooking(tomorrowDinner.id, s.userId, "accepted");
    await makeBooking(dayAfter.id, s.userId, "accepted");
    expect(await ensureReminders(db, { userId: s.userId, now: cronRun })).toBe(1);
    expect((await listNotifications(db, s.userId))[0].body).toContain("Dîner du 23");
  });

  it("ne crée rien pour un repas déjà commencé", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile();
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() - HOUR) });
    await makeBooking(meal.id, s.userId, "accepted");
    expect(await ensureReminders(db, {})).toBe(0);
  });
});
