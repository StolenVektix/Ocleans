import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profiles, verifications } from "@/db/schema";
import type { CardStorage } from "@/services/storage";
import { queueNotifications } from "@/server/notifications/service";

export const CARD_RETENTION_DAYS = 30;
export const EXPIRED_CARD_REASON = "Demande expirée, merci de renvoyer votre carte";

// Spec §9 : aucune photo de carte ne reste plus de 30 jours, même sans décision.
export async function cleanupStaleCards(db: Db, storage: CardStorage, now = new Date()): Promise<{ expired: number; orphansDeleted: number }> {
  const limit = new Date(now.getTime() - CARD_RETENTION_DAYS * 24 * 3600_000);
  let expiredCount = 0;
  const expiredKeys = await db.transaction(async (tx) => {
    // Lecture d'abord : un UPDATE … RETURNING renverrait la clé déjà remise à null.
    const stale = await tx
      .select({ id: verifications.id, userId: verifications.userId, key: verifications.cardObjectKey })
      .from(verifications)
      .where(and(eq(verifications.method, "card"), eq(verifications.status, "pending"), lt(verifications.createdAt, limit)))
      .for("update");
    if (stale.length > 0) {
      await tx
        .update(verifications)
        .set({ status: "rejected", rejectionReason: EXPIRED_CARD_REASON, cardObjectKey: null, reviewedAt: now })
        .where(inArray(verifications.id, stale.map((s) => s.id)));
      const userIds = stale.map((s) => s.userId);
      await tx.update(profiles).set({ verificationStatus: "rejected" }).where(and(inArray(profiles.userId, userIds), eq(profiles.verificationStatus, "pending")));
      await queueNotifications(
        tx,
        userIds.map((userId) => ({
          userId,
          type: "verification_rejected" as const,
          title: "Vérification expirée",
          body: `${EXPIRED_CARD_REASON}.`,
          link: "/etudiant/verification",
        })),
      );
    }
    expiredCount = stale.length;
    return stale.map((s) => s.key).filter((k): k is string => Boolean(k));
  });
  for (const key of expiredKeys) await storage.delete(key).catch((e) => console.warn("[cleanup] photo non supprimée", key, e));

  // Photos orphelines (suppression ratée après une décision, envoi interrompu…).
  const referenced = new Set(
    (await db.select({ key: verifications.cardObjectKey }).from(verifications).where(isNotNull(verifications.cardObjectKey))).map((r) => r.key!),
  );
  let orphansDeleted = 0;
  for (const key of await storage.list("cards/")) {
    if (referenced.has(key)) continue;
    try {
      await storage.delete(key);
      orphansDeleted += 1;
    } catch (e) {
      console.warn("[cleanup] photo orpheline non supprimée", key, e);
    }
  }
  return { expired: expiredCount, orphansDeleted };
}
