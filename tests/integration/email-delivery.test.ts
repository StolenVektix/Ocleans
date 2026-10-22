import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { deliverPendingEmails } from "@/server/notifications/delivery";
import { queueNotifications } from "@/server/notifications/service";
import type { EmailMessage, EmailSender } from "@/services/email";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

function recordingSender(fail = false): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    mode: "resend",
    sent,
    async send(message) {
      if (fail) throw new Error("fournisseur indisponible");
      sent.push(message);
    },
  };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("deliverPendingEmails", () => {
  it("envoie les notifications en attente à l'adresse du compte puis les marque envoyées", async () => {
    const userId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    await makeProfile({ userId });
    await queueNotifications(db, [{ userId, type: "booking_accepted", title: "Demande acceptée !", body: "Mireille vous attend.", link: "/etudiant/mes-repas" }]);
    const sender = recordingSender();
    expect(await deliverPendingEmails(db, sender, { appUrl: "https://ocleans-demo.vercel.app" })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sender.sent[0]).toMatchObject({ to: "lea@etu.u-bordeaux.fr", subject: "Ocleans — Demande acceptée !" });
    const [n] = await db.select().from(notifications);
    expect(n.emailStatus).toBe("sent");
    expect(n.emailedAt).not.toBeNull();
    expect(await deliverPendingEmails(db, sender, { appUrl: "https://x" })).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("marque failed sans lever d'erreur si le fournisseur échoue, et skipped sans adresse", async () => {
    const userId = await makeAuthUser("karim@example.com");
    await makeProfile({ userId });
    const orphan = await makeProfile();
    await queueNotifications(db, [
      { userId, type: "booking_declined", title: "Refus", body: "…", link: "/repas" },
      { userId: orphan.userId, type: "booking_declined", title: "Refus", body: "…", link: "/repas" },
    ]);
    expect(await deliverPendingEmails(db, recordingSender(true), { appUrl: "https://x" })).toEqual({ sent: 0, failed: 1, skipped: 1 });
    const [failed] = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(failed.emailStatus).toBe("failed");
    const [skipped] = await db.select().from(notifications).where(eq(notifications.userId, orphan.userId));
    expect(skipped.emailStatus).toBe("skipped");
  });
});
