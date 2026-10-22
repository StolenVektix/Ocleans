import { describe, expect, it } from "vitest";
import type { Actor } from "./bookings";
import {
  CARD_MAX_BYTES,
  assertCanSubmitVerification,
  assertIsAdmin,
  cardExtension,
  checkCardFile,
  isValidStudentNumber,
  normalizeStudentNumber,
} from "./verification";

const student: Actor = { userId: "s1", role: "student", verificationStatus: "none", suspended: false };
const admin: Actor = { userId: "a1", role: "admin", verificationStatus: "none", suspended: false };
const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("numéro étudiant", () => {
  it("normalise espaces, tirets et casse", () => {
    expect(normalizeStudentNumber(" 21 45-6789a ")).toBe("21456789A");
  });

  it("accepte 5 à 15 lettres ou chiffres par défaut", () => {
    expect(isValidStudentNumber("u-bordeaux", "21456789")).toBe(true);
    expect(isValidStudentNumber("autre", "AB123")).toBe(true);
    expect(isValidStudentNumber("u-bordeaux", "1234")).toBe(false);
    expect(isValidStudentNumber("u-bordeaux", "1234567890123456")).toBe(false);
    expect(isValidStudentNumber("u-bordeaux", "12345_678")).toBe(false);
  });
});

describe("fichier de carte", () => {
  it("accepte JPEG, PNG, HEIC et HEIF jusqu'à 4 Mo", () => {
    expect(checkCardFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(checkCardFile({ type: "image/heic", size: CARD_MAX_BYTES })).toBeNull();
    expect(cardExtension("image/png")).toBe("png");
    expect(cardExtension("image/heif")).toBe("heif");
  });

  it("refuse un fichier vide, trop lourd ou d'un autre type", () => {
    expect(checkCardFile({ type: "image/jpeg", size: 0 })).toBe("EMPTY");
    expect(checkCardFile({ type: "image/jpeg", size: CARD_MAX_BYTES + 1 })).toBe("TOO_LARGE");
    expect(checkCardFile({ type: "application/pdf", size: 1000 })).toBe("BAD_TYPE");
  });
});

describe("droits", () => {
  it("autorise un étudiant non vérifié ou refusé à soumettre", () => {
    expect(code(() => assertCanSubmitVerification(student))).toBeNull();
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "rejected" }))).toBeNull();
  });

  it("refuse les autres cas de soumission", () => {
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "verified" }))).toBe("ALREADY_VERIFIED");
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "pending" }))).toBe("VERIFICATION_PENDING");
    expect(code(() => assertCanSubmitVerification({ ...student, role: "host" }))).toBe("FORBIDDEN");
    expect(code(() => assertCanSubmitVerification({ ...student, suspended: true }))).toBe("SUSPENDED");
  });

  it("réserve la revue aux admins actifs", () => {
    expect(code(() => assertIsAdmin(admin))).toBeNull();
    expect(code(() => assertIsAdmin(student))).toBe("FORBIDDEN");
    expect(code(() => assertIsAdmin({ ...admin, suspended: true }))).toBe("SUSPENDED");
  });
});
