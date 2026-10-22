import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import { assertCanDecide, assertCanRequest, canSeeAddress, type Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import {
  assertCanCancelBooking,
  canCancelBooking,
  canReadThread,
  canReview,
  cancellationSchema,
  type BookingContext,
} from "@/domain/interactions";
import type { BookingStatus, MealStatus } from "@/domain/types";
import { countAccepted } from "@/server/meals/service";
import { reviewedBookingIds } from "@/server/reviews/service";
import { queueNotifications } from "@/server/notifications/service";
import { loadBookingContext } from "./context";

const requestSchema = z.object({
  message: z.string().trim().max(500, "500 caractères maximum").default(""),
});

export interface StudentBooking {
  id: string;
  status: BookingStatus;
  requestMessage: string;
  cancelReason: string | null;
  createdAt: Date;
  actions: { cancel: boolean; messages: boolean; review: boolean; report: boolean };
  meal: {
    id: string;
    title: string;
    startsAt: Date;
    neighborhood: string;
    hostFirstName: string;
    status: MealStatus;
    address: string | null;
  };
}

export async function requestBooking(
  db: Db,
  actor: Actor,
  mealId: string,
  raw: { message?: unknown },
  now = new Date(),
): Promise<{ id: string }> {
  const { message } = requestSchema.parse(raw);
  if (!isUuid(mealId)) throw new DomainError("NOT_FOUND");
  return db.transaction(async (tx) => {
    // Le verrou sur le repas sérialise les demandes et les acceptations concurrentes.
    const [meal] = await tx.select().from(meals).where(eq(meals.id, mealId)).for("update");
    if (!meal) throw new DomainError("NOT_FOUND");
    const [existing] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.mealId, mealId), eq(bookings.studentId, actor.userId)))
      .limit(1);
    const acceptedCount = await countAccepted(tx, mealId);
    assertCanRequest({ actor, meal, acceptedCount, alreadyRequested: Boolean(existing), now });
    const [row] = await tx
      .insert(bookings)
      .values({ mealId, studentId: actor.userId, requestMessage: message })
      .returning({ id: bookings.id });
    const [student] = await tx.select({ firstName: profiles.firstName }).from(profiles).where(eq(profiles.userId, actor.userId));
    await queueNotifications(tx, [
      {
        userId: meal.hostId,
        type: "booking_requested",
        title: "Nouvelle demande",
        body: `${student?.firstName ?? "Un étudiant"} aimerait partager « ${meal.title} ».`,
        link: "/hote/offres",
      },
    ]);
    return row;
  });
}

export async function decideBooking(
  db: Db,
  actor: Actor,
  bookingId: string,
  decision: "accept" | "decline",
  now = new Date(),
): Promise<{ status: BookingStatus }> {
  if (!isUuid(bookingId)) throw new DomainError("NOT_FOUND");
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!booking) throw new DomainError("NOT_FOUND");
    const [meal] = await tx.select().from(meals).where(eq(meals.id, booking.mealId)).for("update");
    // Relire la réservation après le verrou : une autre décision a pu passer entre-temps.
    const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    const acceptedCount = await countAccepted(tx, meal.id);
    assertCanDecide({ actor, meal, bookingStatus: fresh.status, acceptedCount, decision, now });
    const status: BookingStatus = decision === "accept" ? "accepted" : "declined";
    await tx.update(bookings).set({ status }).where(eq(bookings.id, bookingId));
    const ctx = await loadBookingContext(tx, bookingId);
    if (ctx) {
      await queueNotifications(tx, [
        decision === "accept"
          ? {
              userId: ctx.studentId,
              type: "booking_accepted",
              title: "Demande acceptée !",
              body: `${ctx.hostFirstName} vous attend pour « ${ctx.mealTitle} ». L'adresse est dans Mes repas.`,
              link: "/etudiant/mes-repas",
            }
          : {
              userId: ctx.studentId,
              type: "booking_declined",
              title: "Demande non retenue",
              body: `${ctx.hostFirstName} ne peut pas vous accueillir pour « ${ctx.mealTitle} ». D'autres repas vous attendent !`,
              link: "/repas",
            },
      ]);
    }
    return { status };
  });
}

export async function listStudentBookings(db: Db, actor: Actor, now = new Date()): Promise<StudentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      cancelReason: bookings.cancelReason,
      createdAt: bookings.createdAt,
      mealId: meals.id,
      title: meals.title,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      mealStatus: meals.status,
      seatsTotal: meals.seatsTotal,
      address: meals.address,
      hostId: meals.hostId,
      hostFirstName: profiles.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(eq(bookings.studentId, actor.userId))
    .orderBy(desc(meals.startsAt));
  const reviewed = await reviewedBookingIds(db, actor.userId, rows.map((r) => r.id));

  return rows.map((r) => {
    const ctx: BookingContext = {
      hostId: r.hostId,
      studentId: actor.userId,
      bookingStatus: r.status,
      meal: { hostId: r.hostId, status: r.mealStatus, startsAt: r.startsAt, seatsTotal: r.seatsTotal },
    };
    return {
      id: r.id,
      status: r.status,
      requestMessage: r.requestMessage,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt,
      meal: {
        id: r.mealId,
        title: r.title,
        startsAt: r.startsAt,
        neighborhood: r.neighborhood,
        hostFirstName: r.hostFirstName,
        status: r.mealStatus,
        address: canSeeAddress({ viewerId: actor.userId, hostId: r.hostId, viewerBookingStatus: r.status }) ? r.address : null,
      },
      actions: {
        cancel: canCancelBooking({ actor, ctx, now }),
        messages: canReadThread(actor, ctx),
        review: canReview({ actor, ctx, alreadyReviewed: reviewed.has(r.id), now }),
        report: true,
      },
    };
  });
}

export async function cancelBooking(db: Db, actor: Actor, bookingId: string, raw: { reason?: unknown }, now = new Date()): Promise<void> {
  const { reason } = cancellationSchema.parse(raw);
  if (!isUuid(bookingId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    // Verrou sur le repas, comme pour les acceptations : la place libérée ne peut pas être comptée deux fois.
    const [locked] = await tx.select({ mealId: bookings.mealId }).from(bookings).where(eq(bookings.id, bookingId));
    if (!locked) throw new DomainError("NOT_FOUND");
    await tx.select({ id: meals.id }).from(meals).where(eq(meals.id, locked.mealId)).for("update");
    const ctx = await loadBookingContext(tx, bookingId);
    if (!ctx) throw new DomainError("NOT_FOUND");
    assertCanCancelBooking({ actor, ctx, now });
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: reason })
      .where(eq(bookings.id, bookingId));
    await queueNotifications(tx, [
      {
        userId: ctx.hostId,
        type: "booking_cancelled",
        title: "Une venue est annulée",
        body: `${ctx.studentFirstName} ne pourra pas venir à « ${ctx.mealTitle} » : ${reason}`,
        link: "/hote/offres",
      },
    ]);
  });
}
