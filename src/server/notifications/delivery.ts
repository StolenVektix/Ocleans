import { asc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { getEmailSender, renderEmail, type EmailSender } from "@/services/email";
import { getAuthIdentity } from "@/server/auth-identity";

export async function deliverPendingEmails(
  db: Db,
  sender: EmailSender,
  options: { appUrl: string; limit?: number },
): Promise<{ sent: number; failed: number; skipped: number }> {
  // Réservation atomique : deux livraisons simultanées ne traitent pas la même notification.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, body: notifications.body, link: notifications.link })
      .from(notifications)
      .where(eq(notifications.emailStatus, "pending"))
      .orderBy(asc(notifications.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (rows.length > 0) {
      await tx.update(notifications).set({ emailStatus: "skipped" }).where(inArray(notifications.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const n of claimed) {
    const identity = await getAuthIdentity(db, n.userId);
    if (!identity) {
      result.skipped += 1;
      continue;
    }
    try {
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
