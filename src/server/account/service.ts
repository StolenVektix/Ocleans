import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, notifications, profiles, verifications } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import type { CardStorage } from "@/services/storage";
import { queueNotifications } from "@/server/notifications/service";

export const DELETED_FIRST_NAME = "Utilisateur supprimé";
export const ACCOUNT_DELETED_REASON = "Compte supprimé";

const confirmationSchema = z.object({
  confirmation: z.literal("SUPPRIMER", { error: "Tapez SUPPRIMER en majuscules pour confirmer" }),
});

export async function deleteAccount(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  raw: { confirmation?: unknown },
  now = new Date(),
): Promise<void> {
  confirmationSchema.parse(raw);
  const photoKeys = await db.transaction(async (tx) => {
    // Repas à venir de l'hôte : annulés, et les étudiants prévenus.
    const futureMeals = await tx
      .update(meals)
      .set({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON })
      .where(and(eq(meals.hostId, actor.userId), eq(meals.status, "open"), gt(meals.startsAt, now)))
      .returning({ id: meals.id, title: meals.title });
    if (futureMeals.length > 0) {
      const affected = await tx
        .update(bookings)
        .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: ACCOUNT_DELETED_REASON })
        .where(and(inArray(bookings.mealId, futureMeals.map((m) => m.id)), inArray(bookings.status, ["pending", "accepted"])))
        .returning({ studentId: bookings.studentId, mealId: bookings.mealId });
      const titles = new Map(futureMeals.map((m) => [m.id, m.title]));
      await queueNotifications(
        tx,
        affected.map((b) => ({
          userId: b.studentId,
          type: "meal_cancelled" as const,
          title: "Repas annulé",
          body: `« ${titles.get(b.mealId)} » est annulé : l'hôte a quitté Ocleans.`,
          link: "/etudiant/mes-repas",
        })),
      );
    }

    // Adresse et description de tous ses repas, passés compris : seuls restent le titre et la date.
    await tx.update(meals).set({ address: "", description: "" }).where(eq(meals.hostId, actor.userId));

    // Demandes à venir de l'étudiant : annulées, et les hôtes prévenus.
    const upcoming = tx.select({ id: meals.id }).from(meals).where(gt(meals.startsAt, now));
    const myBookings = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: ACCOUNT_DELETED_REASON })
      .where(and(eq(bookings.studentId, actor.userId), inArray(bookings.status, ["pending", "accepted"]), inArray(bookings.mealId, upcoming)))
      .returning({ mealId: bookings.mealId });
    if (myBookings.length > 0) {
      const hostMeals = await tx
        .select({ hostId: meals.hostId, title: meals.title })
        .from(meals)
        .where(inArray(meals.id, myBookings.map((b) => b.mealId)));
      await queueNotifications(
        tx,
        hostMeals.map((m) => ({
          userId: m.hostId,
          type: "booking_cancelled" as const,
          title: "Une venue est annulée",
          body: `Un étudiant a quitté Ocleans : sa demande pour « ${m.title} » est annulée.`,
          link: "/hote/offres",
        })),
      );
    }

    // Données de vérification et notifications : effacées.
    const cards = await tx
      .delete(verifications)
      .where(eq(verifications.userId, actor.userId))
      .returning({ key: verifications.cardObjectKey });
    await tx.delete(notifications).where(eq(notifications.userId, actor.userId));

    // Pierre tombale : les messages, avis et signalements restent liés, sans rien qui identifie la personne.
    await tx
      .update(profiles)
      .set({ firstName: DELETED_FIRST_NAME, bio: "", school: null, verificationStatus: "none", suspended: true, deletedAt: now })
      .where(eq(profiles.userId, actor.userId));

    // Neon Auth : la suppression efface en cascade sessions et comptes de connexion.
    await tx.execute(sql`delete from neon_auth."user" where id::text = ${actor.userId}`);

    return cards.map((c) => c.key).filter((k): k is string => Boolean(k));
  });
  for (const key of photoKeys) await storage.delete(key).catch((e) => console.warn("[account] photo non supprimée", key, e));
}
