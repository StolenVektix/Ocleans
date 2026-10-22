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
