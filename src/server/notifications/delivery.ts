import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { getEmailSender, renderEmail, type EmailSender } from "@/services/email";
import { getAuthIdentity } from "@/server/auth-identity";

export const MAX_EMAIL_ATTEMPTS = 3;
const STALE_CLAIM_MS = 15 * 60_000;

export async function deliverPendingEmails(
  db: Db,
  sender: EmailSender,
  options: { appUrl: string; limit?: number; now?: Date },
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  // Prise en charge atomique (SKIP LOCKED) : en attente, en échec avec des essais restants,
  // ou « en cours » depuis plus de 15 min (processus interrompu).
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, body: notifications.body, link: notifications.link })
      .from(notifications)
      .where(
        or(
          eq(notifications.emailStatus, "pending"),
          and(eq(notifications.emailStatus, "failed"), lt(notifications.emailAttempts, MAX_EMAIL_ATTEMPTS)),
          and(eq(notifications.emailStatus, "sending"), lt(notifications.emailClaimedAt, staleBefore)),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (rows.length > 0) {
      await tx
        .update(notifications)
        .set({ emailStatus: "sending", emailClaimedAt: now, emailAttempts: sql`${notifications.emailAttempts} + 1` })
        .where(inArray(notifications.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const n of claimed) {
    try {
      const identity = await getAuthIdentity(db, n.userId);
      if (!identity) {
        await db.update(notifications).set({ emailStatus: "skipped" }).where(eq(notifications.id, n.id));
        result.skipped += 1;
        continue;
      }
      await sender.send({ to: identity.email, ...renderEmail(n, options.appUrl) });
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date() }).where(eq(notifications.id, n.id));
      result.sent += 1;
    } catch (error) {
      console.warn("[email] échec d'envoi", n.id, error);
      await db.update(notifications).set({ emailStatus: "failed" }).where(eq(notifications.id, n.id));
      result.failed += 1;
    }
  }
  return result;
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// À appeler en fin de Server Action : l'envoi se fait après la réponse, sans ralentir l'utilisateur.
export function scheduleEmailDelivery(): void {
  after(async () => {
    try {
      await deliverPendingEmails(getDb(), getEmailSender(), { appUrl: appUrl() });
    } catch (error) {
      console.warn("[email] livraison différée en échec", error);
    }
  });
}
