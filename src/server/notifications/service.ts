import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { bookings, meals, notifications, profiles } from "@/db/schema";
import { formatMealDate, reminderWindowEnd } from "@/domain/dates";
import type { NotificationType } from "@/domain/types";
import type { Tx } from "@/server/meals/service";

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  dedupeKey?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  createdAt: Date;
  read: boolean;
}

export async function queueNotifications(db: Db | Tx, items: NotificationInput[]): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(notifications)
    .values(items.map((i) => ({ ...i, dedupeKey: i.dedupeKey ?? null })))
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

export async function listNotifications(db: Db, userId: string, limit = 30): Promise<NotificationItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(({ readAt, ...n }) => ({ ...n, read: readAt !== null }));
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markAllRead(db: Db, userId: string, now = new Date()): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

const hostProfile = alias(profiles, "reminder_host");
const studentProfile = alias(profiles, "reminder_student");

// Rappel « la veille » : tout repas accepté qui commence avant la fin du lendemain (heure de Paris).
// Idempotent grâce à dedupe_key, donc utilisable à chaque affichage de page comme depuis le cron.
export async function ensureReminders(db: Db, options: { userId?: string; now?: Date }): Promise<number> {
  const now = options.now ?? new Date();
  const until = reminderWindowEnd(now);
  const conditions = [
    eq(bookings.status, "accepted"),
    eq(meals.status, "open"),
    gt(meals.startsAt, now),
    lte(meals.startsAt, until),
  ];
  if (options.userId) conditions.push(or(eq(meals.hostId, options.userId), eq(bookings.studentId, options.userId))!);
  const rows = await db
    .select({
      bookingId: bookings.id,
      studentId: bookings.studentId,
      hostId: meals.hostId,
      title: meals.title,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      hostFirstName: hostProfile.firstName,
      studentFirstName: studentProfile.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(hostProfile, eq(hostProfile.userId, meals.hostId))
    .innerJoin(studentProfile, eq(studentProfile.userId, bookings.studentId))
    .where(and(...conditions));

  const items: NotificationInput[] = [];
  for (const r of rows) {
    const when = formatMealDate(r.startsAt);
    if (!options.userId || options.userId === r.studentId) {
      items.push({
        userId: r.studentId,
        type: "reminder",
        title: "Rappel : votre repas approche",
        body: `« ${r.title} » chez ${r.hostFirstName}, ${when} (${r.neighborhood}). L'adresse est dans Mes repas.`,
        link: "/etudiant/mes-repas",
        dedupeKey: `reminder:${r.bookingId}:${r.studentId}`,
      });
    }
    if (!options.userId || options.userId === r.hostId) {
      items.push({
        userId: r.hostId,
        type: "reminder",
        title: "Rappel : vous recevez bientôt",
        body: `${r.studentFirstName} vient partager « ${r.title} », ${when}.`,
        link: "/hote/offres",
        dedupeKey: `reminder:${r.bookingId}:${r.hostId}`,
      });
    }
  }
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(notifications)
    .values(items)
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return inserted.length;
}
