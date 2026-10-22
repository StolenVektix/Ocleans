import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import { isUuid } from "@/domain/ids";
import type { BookingContext } from "@/domain/interactions";
import type { Tx } from "@/server/meals/service";

export interface BookingContextRow extends BookingContext {
  bookingId: string;
  mealId: string;
  mealTitle: string;
  hostFirstName: string;
  studentFirstName: string;
}

const hostProfile = alias(profiles, "host_profile");
const studentProfile = alias(profiles, "student_profile");

export async function loadBookingContext(db: Db | Tx, bookingId: string): Promise<BookingContextRow | null> {
  if (!isUuid(bookingId)) return null;
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      studentId: bookings.studentId,
      mealId: meals.id,
      mealTitle: meals.title,
      hostId: meals.hostId,
      mealStatus: meals.status,
      startsAt: meals.startsAt,
      seatsTotal: meals.seatsTotal,
      hostFirstName: hostProfile.firstName,
      studentFirstName: studentProfile.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(hostProfile, eq(hostProfile.userId, meals.hostId))
    .innerJoin(studentProfile, eq(studentProfile.userId, bookings.studentId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    bookingId: row.bookingId,
    bookingStatus: row.bookingStatus,
    studentId: row.studentId,
    hostId: row.hostId,
    mealId: row.mealId,
    mealTitle: row.mealTitle,
    hostFirstName: row.hostFirstName,
    studentFirstName: row.studentFirstName,
    meal: { hostId: row.hostId, status: row.mealStatus, startsAt: row.startsAt, seatsTotal: row.seatsTotal },
  };
}
