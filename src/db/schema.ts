import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
// Imports relatifs : drizzle-kit charge ce fichier sans les alias de tsconfig.
import type { DietTag } from "../config/diet-tags";
import {
  BOOKING_STATUSES,
  EMAIL_STATUSES,
  MEAL_STATUSES,
  NOTIFICATION_TYPES,
  REPORT_STATUSES,
  ROLES,
  VERIFICATION_METHODS,
  VERIFICATION_REQUEST_STATUSES,
  VERIFICATION_STATUSES,
} from "../domain/types";

export const roleEnum = pgEnum("role", ROLES);
export const verificationStatusEnum = pgEnum("verification_status", VERIFICATION_STATUSES);
export const mealStatusEnum = pgEnum("meal_status", MEAL_STATUSES);
export const bookingStatusEnum = pgEnum("booking_status", BOOKING_STATUSES);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  role: roleEnum("role").notNull(),
  firstName: text("first_name").notNull(),
  bio: text("bio").notNull().default(""),
  school: text("school"),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("none"),
  suspended: boolean("suspended").notNull().default(false),
  ...timestamps(),
});

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    neighborhood: text("neighborhood").notNull(),
    address: text("address").notNull(),
    seatsTotal: integer("seats_total").notNull(),
    dietTags: text("diet_tags")
      .array()
      .$type<DietTag[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    allergens: text("allergens").notNull().default(""),
    status: mealStatusEnum("status").notNull().default("open"),
    cancelReason: text("cancel_reason"),
    ...timestamps(),
  },
  (t) => [index("meals_starts_at_idx").on(t.startsAt), index("meals_host_idx").on(t.hostId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    requestMessage: text("request_message").notNull().default(""),
    status: bookingStatusEnum("status").notNull().default("pending"),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    ...timestamps(),
  },
  (t) => [
    unique("bookings_meal_student_unique").on(t.mealId, t.studentId),
    index("bookings_student_idx").on(t.studentId),
  ],
);

export const verificationMethodEnum = pgEnum("verification_method", VERIFICATION_METHODS);
export const verificationRequestStatusEnum = pgEnum("verification_request_status", VERIFICATION_REQUEST_STATUSES);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    method: verificationMethodEnum("method").notNull(),
    universityEmail: text("university_email"),
    school: text("school"),
    studentNumber: text("student_number"),
    cardObjectKey: text("card_object_key"),
    status: verificationRequestStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("verifications_user_idx").on(t.userId), index("verifications_status_idx").on(t.status)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_booking_idx").on(t.bookingId, t.createdAt)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    ...timestamps(),
  },
  (t) => [unique("reviews_booking_author_unique").on(t.bookingId, t.authorId), index("reviews_target_idx").on(t.targetId)],
);

export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").notNull().default("open"),
    handledBy: text("handled_by"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);
export const emailStatusEnum = pgEnum("email_status", EMAIL_STATUSES);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull(),
    dedupeKey: text("dedupe_key").unique("notifications_dedupe_key_unique"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailStatus: emailStatusEnum("email_status").notNull().default("pending"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_email_idx").on(t.emailStatus)],
);

export type Profile = typeof profiles.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
