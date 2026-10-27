import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/db/client";
import type { EmailSender } from "@/services/email";
import type { CardStorage } from "@/services/storage";
import { cleanupStaleCards } from "@/server/cleanup";
import { deliverPendingEmails } from "@/server/notifications/delivery";
import { ensureReminders } from "@/server/notifications/service";

export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function runDailyJob(db: Db, sender: EmailSender, options: { appUrl: string; now?: Date; storage?: CardStorage }) {
  const reminders = await ensureReminders(db, { now: options.now });
  const cleanup = options.storage ? await cleanupStaleCards(db, options.storage, options.now) : { expired: 0, orphansDeleted: 0 };
  const emails = await deliverPendingEmails(db, sender, { appUrl: options.appUrl, limit: 500 });
  return { reminders, cleanup, emails };
}
