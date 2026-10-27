import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { messages, profiles } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { canReadThread, canWriteThread, participantRole } from "@/domain/interactions";
import { assertUnderLimit } from "@/domain/rate-limits";
import { countRecent } from "@/server/rate-limits";
import { loadBookingContext } from "@/server/bookings/context";

const messageSchema = z.object({
  body: z.string({ error: "Écrivez un message" }).trim().min(1, "Écrivez un message").max(1000, "1000 caractères maximum"),
});

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: Date;
  mine: boolean;
  senderFirstName: string;
}

export interface Thread {
  bookingId: string;
  mealId: string;
  mealTitle: string;
  mealStartsAt: Date;
  otherFirstName: string;
  canWrite: boolean;
  messages: ThreadMessage[];
}

export async function getThread(db: Db, actor: Actor, bookingId: string, now = new Date()): Promise<Thread | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || !canReadThread(actor, ctx)) return null;
  const rows = await db
    .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId, senderFirstName: profiles.firstName })
    .from(messages)
    .innerJoin(profiles, eq(profiles.userId, messages.senderId))
    .where(eq(messages.bookingId, bookingId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return {
    bookingId: ctx.bookingId,
    mealId: ctx.mealId,
    mealTitle: ctx.mealTitle,
    mealStartsAt: ctx.meal.startsAt,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
    canWrite: canWriteThread(actor, ctx, now),
    messages: rows.map(({ senderId, ...m }) => ({ ...m, mine: senderId === actor.userId })),
  };
}

export async function postMessage(db: Db, actor: Actor, bookingId: string, raw: { body?: unknown }, now = new Date()): Promise<void> {
  const { body } = messageSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  if (!canReadThread(actor, ctx)) throw new DomainError("FORBIDDEN");
  if (!canWriteThread(actor, ctx, now)) throw new DomainError("THREAD_CLOSED");
  assertUnderLimit("messages", await countRecent(db, "messages", actor.userId, now));
  await db.insert(messages).values({ bookingId, senderId: actor.userId, body });
}
