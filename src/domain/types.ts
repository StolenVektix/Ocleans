export const ROLES = ["student", "host", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATION_STATUSES = ["none", "pending", "verified", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MEAL_STATUSES = ["open", "cancelled"] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const BOOKING_STATUSES = ["pending", "accepted", "declined", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
