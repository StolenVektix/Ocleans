import { DEFAULT_STUDENT_NUMBER_RULE, STUDENT_NUMBER_RULES, type SchoolId } from "@/config/schools";
import { assertActive, type Actor } from "./bookings";
import { DomainError } from "./errors";

export const CARD_MAX_BYTES = 4 * 1024 * 1024;

export const CARD_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

export type CardFileProblem = "EMPTY" | "TOO_LARGE" | "BAD_TYPE";

export const CARD_FILE_MESSAGES: Record<CardFileProblem, string> = {
  EMPTY: "Ajoutez une photo de votre carte étudiante.",
  TOO_LARGE: "La photo dépasse 4 Mo. Réduisez sa taille ou prenez une photo moins lourde.",
  BAD_TYPE: "Format non accepté : utilisez une photo JPEG, PNG ou HEIC.",
};

export function normalizeStudentNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidStudentNumber(schoolId: SchoolId, value: string): boolean {
  return (STUDENT_NUMBER_RULES[schoolId] ?? DEFAULT_STUDENT_NUMBER_RULE).test(value);
}

export function checkCardFile(file: { type: string; size: number }): CardFileProblem | null {
  if (file.size <= 0) return "EMPTY";
  if (!Object.hasOwn(CARD_CONTENT_TYPES, file.type)) return "BAD_TYPE";
  if (file.size > CARD_MAX_BYTES) return "TOO_LARGE";
  return null;
}

export function cardExtension(type: string): string {
  return CARD_CONTENT_TYPES[type as keyof typeof CARD_CONTENT_TYPES];
}

export function assertCanSubmitVerification(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "student") throw new DomainError("FORBIDDEN");
  if (actor.verificationStatus === "verified") throw new DomainError("ALREADY_VERIFIED");
  if (actor.verificationStatus === "pending") throw new DomainError("VERIFICATION_PENDING");
}

export function assertIsAdmin(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "admin") throw new DomainError("FORBIDDEN");
}
