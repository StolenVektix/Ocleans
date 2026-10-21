import { and, arrayContains, asc, count, desc, eq, gt, gte, inArray, lt, type SQL } from "drizzle-orm";
import type { DietTag } from "@/config/diet-tags";
import { isDietTag } from "@/config/diet-tags";
import { isNeighborhood } from "@/config/neighborhoods";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import {
  assertCanCreateMeal,
  assertCanEditMeal,
  canSeeAddress,
  seatsLeft,
  type Actor,
} from "@/domain/bookings";
import { isDayString, nextDay, parisLocalToDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import { mealInputSchema } from "@/domain/meal-input";
import type { BookingStatus, MealStatus } from "@/domain/types";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface PublicMeal {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  neighborhood: string;
  seatsTotal: number;
  seatsLeft: number;
  dietTags: DietTag[];
  allergens: string;
  status: MealStatus;
  hostId: string;
  hostFirstName: string;
}

export interface MealDetail extends PublicMeal {
  address: string | null;
  viewerBooking: { id: string; status: BookingStatus } | null;
}

export interface HostMealRequest {
  id: string;
  status: BookingStatus;
  requestMessage: string;
  createdAt: Date;
  studentFirstName: string;
  studentSchool: string | null;
  studentVerified: boolean;
}

export interface HostMeal {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  neighborhood: string;
  address: string;
  seatsTotal: number;
  seatsLeft: number;
  dietTags: DietTag[];
  allergens: string;
  status: MealStatus;
  requests: HostMealRequest[];
}

export interface MealFilters {
  neighborhood?: string;
  dietTag?: string;
  day?: string;
}

// Colonnes publiques : l'adresse n'en fait volontairement pas partie.
const publicMealColumns = {
  id: meals.id,
  title: meals.title,
  description: meals.description,
  startsAt: meals.startsAt,
  neighborhood: meals.neighborhood,
  seatsTotal: meals.seatsTotal,
  dietTags: meals.dietTags,
  allergens: meals.allergens,
  status: meals.status,
  hostId: meals.hostId,
  hostFirstName: profiles.firstName,
};

export async function countAccepted(db: Db | Tx, mealId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.mealId, mealId), eq(bookings.status, "accepted")));
  return Number(row?.n ?? 0);
}

async function acceptedCounts(db: Db, mealIds: string[]): Promise<Map<string, number>> {
  if (mealIds.length === 0) return new Map();
  const rows = await db
    .select({ mealId: bookings.mealId, n: count() })
    .from(bookings)
    .where(and(inArray(bookings.mealId, mealIds), eq(bookings.status, "accepted")))
    .groupBy(bookings.mealId);
  return new Map(rows.map((r) => [r.mealId, Number(r.n)]));
}

export async function createMeal(db: Db, actor: Actor, raw: unknown, now = new Date()): Promise<{ id: string }> {
  assertCanCreateMeal(actor);
  const input = mealInputSchema(now).parse(raw);
  const [row] = await db
    .insert(meals)
    .values({ hostId: actor.userId, ...input })
    .returning({ id: meals.id });
  return row;
}

export async function updateMeal(db: Db, actor: Actor, mealId: string, raw: unknown, now = new Date()): Promise<void> {
  const input = mealInputSchema(now).parse(raw);
  if (!isUuid(mealId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [meal] = await tx.select().from(meals).where(eq(meals.id, mealId)).for("update");
    if (!meal) throw new DomainError("NOT_FOUND");
    const acceptedCount = await countAccepted(tx, mealId);
    assertCanEditMeal({ actor, meal, newSeatsTotal: input.seatsTotal, acceptedCount, now });
    await tx.update(meals).set(input).where(eq(meals.id, mealId));
  });
}

export async function listUpcomingMeals(db: Db, filters: MealFilters, now = new Date()): Promise<PublicMeal[]> {
  const conditions: SQL[] = [eq(meals.status, "open"), gt(meals.startsAt, now), eq(profiles.suspended, false)];
  if (filters.neighborhood && isNeighborhood(filters.neighborhood)) {
    conditions.push(eq(meals.neighborhood, filters.neighborhood));
  }
  if (filters.dietTag && isDietTag(filters.dietTag)) {
    conditions.push(arrayContains(meals.dietTags, [filters.dietTag]));
  }
  if (filters.day && isDayString(filters.day)) {
    conditions.push(gte(meals.startsAt, parisLocalToDate(`${filters.day}T00:00`)));
    conditions.push(lt(meals.startsAt, parisLocalToDate(`${nextDay(filters.day)}T00:00`)));
  }
  const rows = await db
    .select(publicMealColumns)
    .from(meals)
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(and(...conditions))
    .orderBy(asc(meals.startsAt));
  const counts = await acceptedCounts(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, seatsLeft: seatsLeft(r.seatsTotal, counts.get(r.id) ?? 0) }));
}

export async function getMealForViewer(db: Db, viewer: Actor | null, mealId: string): Promise<MealDetail | null> {
  if (!isUuid(mealId)) return null;
  const [row] = await db
    .select(publicMealColumns)
    .from(meals)
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(and(eq(meals.id, mealId), eq(profiles.suspended, false)))
    .limit(1);
  if (!row) return null;

  let viewerBooking: MealDetail["viewerBooking"] = null;
  if (viewer) {
    const [b] = await db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.mealId, mealId), eq(bookings.studentId, viewer.userId)))
      .limit(1);
    viewerBooking = b ?? null;
  }

  let address: string | null = null;
  if (canSeeAddress({ viewerId: viewer?.userId ?? null, hostId: row.hostId, viewerBookingStatus: viewerBooking?.status ?? null })) {
    const [a] = await db.select({ address: meals.address }).from(meals).where(eq(meals.id, mealId));
    address = a.address;
  }

  return { ...row, seatsLeft: seatsLeft(row.seatsTotal, await countAccepted(db, mealId)), address, viewerBooking };
}

async function loadHostMeals(db: Db, actor: Actor, mealId?: string): Promise<HostMeal[]> {
  const conditions: SQL[] = [eq(meals.hostId, actor.userId)];
  if (mealId) conditions.push(eq(meals.id, mealId));
  const rows = await db
    .select({
      id: meals.id,
      title: meals.title,
      description: meals.description,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      address: meals.address,
      seatsTotal: meals.seatsTotal,
      dietTags: meals.dietTags,
      allergens: meals.allergens,
      status: meals.status,
    })
    .from(meals)
    .where(and(...conditions))
    .orderBy(desc(meals.startsAt));
  if (rows.length === 0) return [];

  const requests = await db
    .select({
      id: bookings.id,
      mealId: bookings.mealId,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      createdAt: bookings.createdAt,
      studentFirstName: profiles.firstName,
      studentSchool: profiles.school,
      studentVerification: profiles.verificationStatus,
    })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.userId, bookings.studentId))
    .where(inArray(bookings.mealId, rows.map((r) => r.id)))
    .orderBy(asc(bookings.createdAt));

  return rows.map((meal) => {
    const own = requests.filter((r) => r.mealId === meal.id);
    const accepted = own.filter((r) => r.status === "accepted").length;
    return {
      ...meal,
      seatsLeft: seatsLeft(meal.seatsTotal, accepted),
      requests: own.map((r) => ({
        id: r.id,
        status: r.status,
        requestMessage: r.requestMessage,
        createdAt: r.createdAt,
        studentFirstName: r.studentFirstName,
        studentSchool: r.studentSchool,
        studentVerified: r.studentVerification === "verified",
      })),
    };
  });
}

export function listHostMeals(db: Db, actor: Actor): Promise<HostMeal[]> {
  return loadHostMeals(db, actor);
}

export async function getHostMeal(db: Db, actor: Actor, mealId: string): Promise<HostMeal | null> {
  if (!isUuid(mealId)) return null;
  const [meal] = await loadHostMeals(db, actor, mealId);
  return meal ?? null;
}
