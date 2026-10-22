export const ROLES = ["student", "host", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATION_STATUSES = ["none", "pending", "verified", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MEAL_STATUSES = ["open", "cancelled"] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const BOOKING_STATUSES = ["pending", "accepted", "declined", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const VERIFICATION_METHODS = ["university_email", "card"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type VerificationRequestStatus = (typeof VERIFICATION_REQUEST_STATUSES)[number];

export const REPORT_STATUSES = ["open", "handled"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface Rating {
  average: number;
  count: number;
}

export const NOTIFICATION_TYPES = [
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_cancelled",
  "meal_cancelled",
  "cancelled_by_team",
  "reminder",
  "verification_approved",
  "verification_rejected",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const EMAIL_STATUSES = ["pending", "sending", "sent", "failed", "skipped"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
