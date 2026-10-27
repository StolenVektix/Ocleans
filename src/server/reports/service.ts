import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, profiles, reports } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import { assertUnderLimit } from "@/domain/rate-limits";
import { countRecent } from "@/server/rate-limits";
import { assertCanReport, otherParticipantId, participantRole } from "@/domain/interactions";
import type { Role } from "@/domain/types";
import { assertIsAdmin } from "@/domain/verification";
import { loadBookingContext } from "@/server/bookings/context";
import { queueNotifications } from "@/server/notifications/service";
import type { Tx } from "@/server/meals/service";

// Affiché aux autres participants (hôtes, étudiants) : il ne doit pas révéler une sanction de modération.
export const SUSPENSION_REASON = "Annulé par l'équipe Ocleans";

const reportSchema = z.object({
  reason: z
    .string({ error: "Décrivez le problème" })
    .trim()
    .min(10, "Décrivez le problème (10 caractères minimum)")
    .max(1000, "1000 caractères maximum"),
});

export interface ReportTarget {
  bookingId: string;
  mealTitle: string;
  otherFirstName: string;
}

export interface OpenReport {
  id: string;
  reason: string;
  createdAt: Date;
  reporterFirstName: string;
  reportedUserId: string;
  reportedFirstName: string;
  reportedRole: Role;
  reportedSuspended: boolean;
  mealTitle: string | null;
}

const reporter = alias(profiles, "reporter");
const reported = alias(profiles, "reported");

export async function getReportTarget(db: Db, actor: Actor, bookingId: string): Promise<ReportTarget | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || participantRole(actor, ctx) === null) return null;
  return {
    bookingId: ctx.bookingId,
    mealTitle: ctx.mealTitle,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
  };
}

export async function createReport(db: Db, actor: Actor, bookingId: string, raw: { reason?: unknown }): Promise<{ id: string }> {
  const { reason } = reportSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  assertCanReport({ actor, ctx });
  assertUnderLimit("reports", await countRecent(db, "reports", actor.userId, new Date()));
  const [row] = await db
    .insert(reports)
    .values({ reporterId: actor.userId, reportedUserId: otherParticipantId(actor, ctx), bookingId, reason })
    .returning({ id: reports.id });
  return row;
}

export async function listOpenReports(db: Db, actor: Actor): Promise<OpenReport[]> {
  assertIsAdmin(actor);
  return db
    .select({
      id: reports.id,
      reason: reports.reason,
      createdAt: reports.createdAt,
      reporterFirstName: reporter.firstName,
      reportedUserId: reports.reportedUserId,
      reportedFirstName: reported.firstName,
      reportedRole: reported.role,
      reportedSuspended: reported.suspended,
      mealTitle: meals.title,
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.userId, reports.reporterId))
    .innerJoin(reported, eq(reported.userId, reports.reportedUserId))
    .leftJoin(bookings, eq(bookings.id, reports.bookingId))
    .leftJoin(meals, eq(meals.id, bookings.mealId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt));
}

// Règle 9 : un compte suspendu ne se connecte plus, ses repas à venir sont annulés, et ses demandes à venir aussi.
async function suspendUser(tx: Tx, userId: string, adminId: string, now: Date): Promise<void> {
  await tx.update(profiles).set({ suspended: true }).where(eq(profiles.userId, userId));
  const futureMeals = await tx
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.hostId, userId), eq(meals.status, "open"), gt(meals.startsAt, now)));
  const mealIds = futureMeals.map((m) => m.id);
  if (mealIds.length > 0) {
    await tx
      .update(meals)
      .set({ status: "cancelled", cancelReason: SUSPENSION_REASON })
      .where(and(inArray(meals.id, mealIds), eq(meals.status, "open")));
    const hostBookings = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: adminId, cancelReason: SUSPENSION_REASON })
      .where(and(inArray(bookings.mealId, mealIds), inArray(bookings.status, ["pending", "accepted"])))
      .returning({ studentId: bookings.studentId });
    await queueNotifications(
      tx,
      hostBookings.map((b) => ({
        userId: b.studentId,
        type: "cancelled_by_team" as const,
        title: "Repas annulé",
        body: `Un repas que vous aviez demandé a été annulé par l'équipe Ocleans.`,
        link: "/etudiant/mes-repas",
      })),
    );
  }
  const upcomingForStudent = tx
    .select({ id: meals.id })
    .from(meals)
    .where(gt(meals.startsAt, now));
  const studentBookings = await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledBy: adminId, cancelReason: SUSPENSION_REASON })
    .where(
      and(eq(bookings.studentId, userId), inArray(bookings.status, ["pending", "accepted"]), inArray(bookings.mealId, upcomingForStudent)),
    )
    .returning({ mealId: bookings.mealId });
  if (studentBookings.length > 0) {
    const titles = await tx
      .select({ id: meals.id, hostId: meals.hostId, title: meals.title })
      .from(meals)
      .where(inArray(meals.id, studentBookings.map((b) => b.mealId)));
    const byId = new Map(titles.map((m) => [m.id, m]));
    await queueNotifications(
      tx,
      studentBookings.map((b) => ({
        userId: byId.get(b.mealId)!.hostId,
        type: "cancelled_by_team" as const,
        title: "Une demande a été annulée",
        body: `Une demande pour « ${byId.get(b.mealId)!.title} » a été annulée par l'équipe Ocleans.`,
        link: "/hote/offres",
      })),
    );
  }

}

export async function resolveReport(db: Db, actor: Actor, reportId: string, decision: "dismiss" | "suspend", now = new Date()): Promise<void> {
  assertIsAdmin(actor);
  if (!isUuid(reportId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for("update");
    if (!report) throw new DomainError("NOT_FOUND");
    if (report.status !== "open") throw new DomainError("ALREADY_HANDLED");
    if (decision === "suspend") {
      const [target] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.userId, report.reportedUserId));
      if (!target || target.role === "admin") throw new DomainError("FORBIDDEN");
      await suspendUser(tx, report.reportedUserId, actor.userId, now);
    }
    await tx.update(reports).set({ status: "handled", handledBy: actor.userId, handledAt: now }).where(eq(reports.id, reportId));
  });
}
