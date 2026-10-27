import { and, count, eq, gt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, messages, reports, verifications } from "@/db/schema";
import { RATE_LIMITS, type RateLimitKey } from "@/domain/rate-limits";
import type { Tx } from "@/server/meals/service";

export async function countRecent(db: Db | Tx, key: RateLimitKey, userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - RATE_LIMITS[key].windowMs);
  const query = {
    bookingRequests: () => db.select({ n: count() }).from(bookings).where(and(eq(bookings.studentId, userId), gt(bookings.createdAt, since))),
    messages: () => db.select({ n: count() }).from(messages).where(and(eq(messages.senderId, userId), gt(messages.createdAt, since))),
    reports: () => db.select({ n: count() }).from(reports).where(and(eq(reports.reporterId, userId), gt(reports.createdAt, since))),
    cardSubmissions: () =>
      db.select({ n: count() }).from(verifications).where(and(eq(verifications.userId, userId), eq(verifications.method, "card"), gt(verifications.createdAt, since))),
  }[key];
  const [row] = await query();
  return Number(row?.n ?? 0);
}
