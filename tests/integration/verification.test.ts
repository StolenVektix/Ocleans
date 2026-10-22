import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { profiles, verifications } from "@/db/schema";
import { CARD_MAX_BYTES } from "@/domain/verification";
import { createMemoryStorage } from "@/services/storage";
import {
  confirmUniversityEmail,
  getVerificationOverview,
  listPendingCards,
  reviewCard,
  submitStudentCard,
} from "@/server/verification/service";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

const jpeg = (size = 1000) => ({ type: "image/jpeg", size, bytes: new Uint8Array(Math.min(size, 16)) });
const cardRaw = { school: "bordeaux-inp", studentNumber: "21 456 789" };

async function student(email: string, emailVerified = false, overrides: Partial<typeof profiles.$inferInsert> = {}) {
  const userId = await makeAuthUser(email, emailVerified);
  return makeProfile({ userId, role: "student", verificationStatus: "none", school: "Université de Bordeaux", ...overrides });
}

async function statusOf(userId: string) {
  const [p] = await db.select({ s: profiles.verificationStatus }).from(profiles).where(eq(profiles.userId, userId));
  return p.s;
}

beforeEach(resetDb);
afterAll(closeDb);

describe("confirmUniversityEmail", () => {
  it("vérifie un étudiant dont l'adresse universitaire est confirmée dans neon_auth", async () => {
    const s = await student("lea@etu.u-bordeaux.fr", true);
    await confirmUniversityEmail(db, s);
    expect(await statusOf(s.userId)).toBe("verified");
    const [v] = await db.select().from(verifications).where(eq(verifications.userId, s.userId));
    expect(v).toMatchObject({ method: "university_email", status: "approved", universityEmail: "lea@etu.u-bordeaux.fr", school: "Université de Bordeaux" });
  });

  it("refuse une adresse non confirmée ou non universitaire", async () => {
    const notConfirmed = await student("lea@etu.u-bordeaux.fr", false);
    await expect(confirmUniversityEmail(db, notConfirmed)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    const staff = await student("prof@u-bordeaux.fr", true);
    await expect(confirmUniversityEmail(db, staff)).rejects.toMatchObject({ code: "NOT_UNIVERSITY_EMAIL" });
    expect(await statusOf(notConfirmed.userId)).toBe("none");
  });

  it("refuse un étudiant déjà vérifié ou en attente, et un hôte", async () => {
    const verified = await student("a@etu.u-bordeaux.fr", true, { verificationStatus: "verified" });
    await expect(confirmUniversityEmail(db, verified)).rejects.toMatchObject({ code: "ALREADY_VERIFIED" });
    const pending = await student("b@etu.u-bordeaux.fr", true, { verificationStatus: "pending" });
    await expect(confirmUniversityEmail(db, pending)).rejects.toMatchObject({ code: "VERIFICATION_PENDING" });
    const hostId = await makeAuthUser("h@etu.u-bordeaux.fr", true);
    const host = await makeProfile({ userId: hostId, role: "host" });
    await expect(confirmUniversityEmail(db, host)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("submitStudentCard", () => {
  it("stocke la photo, crée une demande en attente et passe l'étudiant en pending", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    const { id } = await submitStudentCard(db, storage, s, cardRaw, jpeg());
    const [v] = await db.select().from(verifications).where(eq(verifications.id, id));
    expect(v).toMatchObject({ method: "card", status: "pending", school: "Bordeaux INP", studentNumber: "21456789" });
    expect(v.cardObjectKey).toMatch(new RegExp(`^cards/${s.userId}/[0-9a-f-]+\\.jpg$`));
    expect(storage.objects.has(v.cardObjectKey!)).toBe(true);
    expect(await statusOf(s.userId)).toBe("pending");
  });

  it("refuse un numéro invalide, un établissement inconnu, un fichier trop lourd ou d'un mauvais type, sans rien stocker", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    await expect(submitStudentCard(db, storage, s, { ...cardRaw, studentNumber: "12" }, jpeg())).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, { ...cardRaw, school: "harvard" }, jpeg())).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, cardRaw, jpeg(CARD_MAX_BYTES + 1))).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, cardRaw, { type: "application/pdf", size: 10, bytes: new Uint8Array(10) })).rejects.toBeInstanceOf(ZodError);
    expect(storage.objects.size).toBe(0);
    expect(await statusOf(s.userId)).toBe("none");
  });

  it("n'accepte qu'un envoi en cas de double-clic et supprime la photo en trop", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    const results = await Promise.allSettled([
      submitStudentCard(db, storage, s, cardRaw, jpeg()),
      submitStudentCard(db, storage, s, cardRaw, jpeg()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "VERIFICATION_PENDING" });
    expect(storage.objects.size).toBe(1);
    expect(await db.select().from(verifications)).toHaveLength(1);
  });

  it("permet un nouvel envoi après un refus", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com", false, { verificationStatus: "rejected" });
    await submitStudentCard(db, storage, s, cardRaw, jpeg());
    expect(await statusOf(s.userId)).toBe("pending");
  });
});

describe("listPendingCards et reviewCard", () => {
  async function setup() {
    const storage = createMemoryStorage();
    const adminId = await makeAuthUser("admin@example.com");
    const admin = await makeProfile({ userId: adminId, role: "admin" });
    const s = await student("chloe@gmail.com", false, { firstName: "Chloé" });
    const { id } = await submitStudentCard(db, storage, s, cardRaw, jpeg());
    const freshStudent = { ...s, verificationStatus: "pending" as const };
    return { storage, admin, student: freshStudent, id };
  }

  it("liste les cartes en attente avec une URL signée de 5 minutes, pour un admin seulement", async () => {
    const { storage, admin, student: s, id } = await setup();
    const list = await listPendingCards(db, storage, admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, firstName: "Chloé", school: "Bordeaux INP", studentNumber: "21456789" });
    expect(list[0].imageUrl).toContain("expires=300");
    await expect(listPendingCards(db, storage, s)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("signale qu'une photo HEIC ne s'affiche pas dans tous les navigateurs", async () => {
    const { storage, admin } = await setup();
    const iphone = await student("iphone@gmail.com");
    await submitStudentCard(db, storage, iphone, cardRaw, { type: "image/heic", size: 1000, bytes: new Uint8Array(8) });
    const list = await listPendingCards(db, storage, admin);
    expect(list.map((c) => c.viewableInBrowser)).toEqual([true, false]);
  });

  it("valide une carte : étudiant vérifié, photo supprimée, clé effacée", async () => {
    const { storage, admin, student: s, id } = await setup();
    await reviewCard(db, storage, admin, id, "approve", {});
    expect(await statusOf(s.userId)).toBe("verified");
    const [v] = await db.select().from(verifications).where(eq(verifications.id, id));
    expect(v).toMatchObject({ status: "approved", cardObjectKey: null, reviewedBy: admin.userId });
    expect(storage.objects.size).toBe(0);
    expect(await listPendingCards(db, storage, admin)).toHaveLength(0);
  });

  it("exige un motif pour refuser, puis enregistre le refus", async () => {
    const { storage, admin, student: s, id } = await setup();
    await expect(reviewCard(db, storage, admin, id, "reject", { reason: " " })).rejects.toBeInstanceOf(ZodError);
    expect(storage.objects.size).toBe(1);
    await reviewCard(db, storage, admin, id, "reject", { reason: "Photo illisible" });
    expect(await statusOf(s.userId)).toBe("rejected");
    const overview = await getVerificationOverview(db, { ...s, verificationStatus: "rejected" });
    expect(overview.latest).toMatchObject({ method: "card", status: "rejected", rejectionReason: "Photo illisible" });
    expect(storage.objects.size).toBe(0);
  });

  it("n'enregistre qu'une décision quand deux admins tranchent en même temps", async () => {
    const { storage, admin, id } = await setup();
    const otherId = await makeAuthUser("admin2@example.com");
    const other = await makeProfile({ userId: otherId, role: "admin" });
    const results = await Promise.allSettled([
      reviewCard(db, storage, admin, id, "approve", {}),
      reviewCard(db, storage, other, id, "reject", { reason: "Doublon" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(reviewCard(db, storage, admin, "abc", "approve", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getVerificationOverview", () => {
  it("indique l'adresse du compte, son statut et l'établissement reconnu", async () => {
    const s = await student("Lea@ETU.u-bordeaux.fr", false);
    expect(await getVerificationOverview(db, s)).toEqual({
      status: "none",
      email: "Lea@ETU.u-bordeaux.fr",
      emailVerified: false,
      university: "Université de Bordeaux",
      latest: null,
    });
  });
});
