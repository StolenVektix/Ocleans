import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals, profiles, reports } from "@/db/schema";
import { listUpcomingMeals } from "@/server/meals/service";
import { createReport, getReportTarget, listOpenReports, resolveReport, SUSPENSION_REASON } from "@/server/reports/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function setup() {
  const admin = await makeProfile({ role: "admin", firstName: "Admin" });
  const host = await makeProfile({ role: "host", firstName: "Mireille" });
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(host.userId, { title: "Pot-au-feu" });
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { admin, host, student, meal, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("createReport", () => {
  it("enregistre un signalement d'un participant contre l'autre, visible par l'admin", async () => {
    const { admin, host, student, booking } = await setup();
    expect(await getReportTarget(db, student, booking.id)).toMatchObject({ otherFirstName: "Mireille", mealTitle: "Pot-au-feu" });
    await createReport(db, student, booking.id, { reason: "  Propos déplacés pendant le repas " });
    const list = await listOpenReports(db, admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      reason: "Propos déplacés pendant le repas",
      reporterFirstName: "Léa",
      reportedUserId: host.userId,
      reportedFirstName: "Mireille",
      reportedRole: "host",
      reportedSuspended: false,
      mealTitle: "Pot-au-feu",
    });
  });

  it("refuse un tiers et un motif trop court, et réserve la liste aux admins", async () => {
    const { student, booking } = await setup();
    const outsider = await makeProfile();
    expect(await getReportTarget(db, outsider, booking.id)).toBeNull();
    await expect(createReport(db, outsider, booking.id, { reason: "Je n'étais pas là" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createReport(db, student, booking.id, { reason: "Bof" })).rejects.toBeInstanceOf(ZodError);
    await expect(listOpenReports(db, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("SUSPENSION_REASON", () => {
  it("reste neutre : les autres utilisateurs ne doivent pas apprendre qu'un compte est suspendu", () => {
    expect(SUSPENSION_REASON).not.toMatch(/suspen|signal|sanction/i);
  });
});

describe("resolveReport", () => {
  it("classe un signalement sans suspendre", async () => {
    const { admin, host, student, booking } = await setup();
    const { id } = await createReport(db, student, booking.id, { reason: "Retard de vingt minutes" });
    await resolveReport(db, admin, id, "dismiss");
    const [r] = await db.select().from(reports).where(eq(reports.id, id));
    expect(r).toMatchObject({ status: "handled", handledBy: admin.userId });
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p.suspended).toBe(false);
    expect(await listOpenReports(db, admin)).toHaveLength(0);
  });

  it("suspend un hôte : ses repas à venir et leurs demandes sont annulés, ses repas passés restent", async () => {
    const { admin, host, student, meal, booking } = await setup();
    const pastMeal = await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) });
    const pastBooking = await makeBooking(pastMeal.id, student.userId, "accepted");
    const { id } = await createReport(db, student, booking.id, { reason: "Comportement inacceptable" });
    await resolveReport(db, admin, id, "suspend");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p.suspended).toBe(true);
    const [m] = await db.select().from(meals).where(eq(meals.id, meal.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: SUSPENSION_REASON });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: SUSPENSION_REASON });
    const [pm] = await db.select().from(meals).where(eq(meals.id, pastMeal.id));
    expect(pm.status).toBe("open");
    const [pb] = await db.select().from(bookings).where(eq(bookings.id, pastBooking.id));
    expect(pb.status).toBe("accepted");
    expect(await listUpcomingMeals(db, {})).toHaveLength(0);
  });

  it("suspend un étudiant : ses demandes à venir sont annulées", async () => {
    const { admin, host, student, booking } = await setup();
    const { id } = await createReport(db, host, booking.id, { reason: "Ne s'est jamais présenté" });
    await resolveReport(db, admin, id, "suspend");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("cancelled");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, student.userId));
    expect(p.suspended).toBe(true);
  });

  it("ne traite qu'une fois un signalement, refuse un non-admin et la suspension d'un admin", async () => {
    const { admin, student, booking } = await setup();
    const other = await makeProfile({ role: "admin" });
    const { id } = await createReport(db, student, booking.id, { reason: "Retard de vingt minutes" });
    await expect(resolveReport(db, student, id, "dismiss")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const results = await Promise.allSettled([resolveReport(db, admin, id, "dismiss"), resolveReport(db, other, id, "suspend")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(resolveReport(db, admin, "abc", "dismiss")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [r] = await db.insert(reports).values({ reporterId: student.userId, reportedUserId: other.userId, reason: "Signalement d'un admin" }).returning();
    await expect(resolveReport(db, admin, r.id, "suspend")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
