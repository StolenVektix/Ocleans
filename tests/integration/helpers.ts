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
  // La branche de test n'a pas Neon Auth : table minimale avec les seules colonnes lues par l'application.
  await db.execute(sql`create schema if not exists neon_auth`);
  await db.execute(
    sql`create table if not exists neon_auth."user" (id uuid primary key default gen_random_uuid(), email text not null, "emailVerified" boolean not null default false)`,
  );
  await db.execute(sql`truncate table verifications, bookings, meals, profiles, neon_auth."user" cascade`);
}

export async function makeAuthUser(email: string, emailVerified = false): Promise<string> {
  const result = await db.execute(
    sql`insert into neon_auth."user" (email, "emailVerified") values (${email}, ${emailVerified}) returning id::text as id`,
  );
  return (result.rows[0] as { id: string }).id;
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
