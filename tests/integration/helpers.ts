import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import type { BookingStatus } from "@/domain/types";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST manquant dans .env.local");

export const db = createDb(url);

export async function resetDb() {
  await db.execute(sql`truncate table bookings, meals, profiles cascade`);
}

export async function closeDb() {
  await db.$client.end();
}

export async function makeProfile(overrides: Partial<typeof profiles.$inferInsert> = {}) {
  const [row] = await db
    .insert(profiles)
    .values({
      userId: `user_${crypto.randomUUID()}`,
      role: "student",
      firstName: "Test",
      verificationStatus: "verified",
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeMeal(hostId: string, overrides: Partial<typeof meals.$inferInsert> = {}) {
  const [row] = await db
    .insert(meals)
    .values({
      hostId,
      title: "Gratin dauphinois",
      description: "Un bon gratin maison avec une salade.",
      startsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
      neighborhood: "Chartrons",
      address: "12 rue Notre-Dame, 33000 Bordeaux",
      seatsTotal: 2,
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeBooking(mealId: string, studentId: string, status: BookingStatus = "pending") {
  const [row] = await db.insert(bookings).values({ mealId, studentId, status }).returning();
  return row;
}
