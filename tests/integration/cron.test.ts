import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { isAuthorizedCron, runDailyJob } from "@/server/cron";
import { createLogEmailSender } from "@/services/email";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("cron quotidien", () => {
  it("n'accepte que le bon secret, jamais un secret vide", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer autre", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });

  it("crée les rappels du lendemain puis envoie les emails en attente", async () => {
    const hostId = await makeAuthUser("mireille@example.com");
    const host = await makeProfile({ userId: hostId, role: "host" });
    const studentId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    const student = await makeProfile({ userId: studentId });
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 6 * 3600 * 1000) });
    await makeBooking(meal.id, student.userId, "accepted");
    const lines: string[] = [];
    const result = await runDailyJob(db, createLogEmailSender((l) => lines.push(l)), { appUrl: "https://x" });
    expect(result).toEqual({ reminders: 2, cleanup: { expired: 0, orphansDeleted: 0 }, emails: { sent: 2, failed: 0, skipped: 0 } });
    expect(lines).toHaveLength(2);
    expect((await db.select().from(notifications)).every((n) => n.emailStatus === "sent")).toBe(true);
  });

  it("envoie quand même les emails si le nettoyage du stockage échoue", async () => {
    const hostId = await makeAuthUser("mireille@example.com");
    const host = await makeProfile({ userId: hostId, role: "host" });
    const studentId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    const student = await makeProfile({ userId: studentId });
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 6 * 3600 * 1000) });
    await makeBooking(meal.id, student.userId, "accepted");
    const storage = { ...createMemoryStorage(), list: async () => { throw new Error("S3 indisponible"); } };
    const result = await runDailyJob(db, createLogEmailSender(() => {}), { appUrl: "https://x", storage });
    expect(result.emails.sent).toBe(2);
    expect(result.cleanup).toBeNull();
  });
});
