import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { SCHOOL_IDS, schoolLabel } from "@/config/schools";
import { universityForEmail } from "@/config/university-domains";
import type { Db } from "@/db/client";
import { profiles, verifications } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import type { VerificationMethod, VerificationRequestStatus, VerificationStatus } from "@/domain/types";
import {
  CARD_FILE_MESSAGES,
  assertCanSubmitVerification,
  assertIsAdmin,
  cardExtension,
  checkCardFile,
  isValidStudentNumber,
  normalizeStudentNumber,
} from "@/domain/verification";
import type { CardStorage } from "@/services/storage";
import { getAuthIdentity } from "@/server/auth-identity";

const SIGNED_URL_SECONDS = 300;

export interface VerificationOverview {
  status: VerificationStatus;
  email: string | null;
  emailVerified: boolean;
  university: string | null;
  latest: {
    method: VerificationMethod;
    status: VerificationRequestStatus;
    rejectionReason: string | null;
    createdAt: Date;
  } | null;
}

export interface CardFile {
  type: string;
  size: number;
  bytes: Uint8Array;
}

export interface PendingCard {
  id: string;
  firstName: string;
  school: string | null;
  studentNumber: string | null;
  createdAt: Date;
  imageUrl: string | null;
  /** false pour HEIC/HEIF : seul Safari sait les afficher, l'admin doit alors télécharger la photo. */
  viewableInBrowser: boolean;
}

const cardSchema = z
  .object({
    school: z.enum(SCHOOL_IDS, { error: "Choisissez votre établissement" }),
    studentNumber: z.string({ error: "Indiquez votre numéro étudiant" }).transform(normalizeStudentNumber),
    card: z.object({ type: z.string(), size: z.number() }),
  })
  .superRefine((value, ctx) => {
    if (!isValidStudentNumber(value.school, value.studentNumber)) {
      ctx.addIssue({ code: "custom", path: ["studentNumber"], message: "Numéro étudiant invalide (5 à 15 lettres ou chiffres)" });
    }
    const problem = checkCardFile(value.card);
    if (problem) ctx.addIssue({ code: "custom", path: ["card"], message: CARD_FILE_MESSAGES[problem] });
  });

const reviewSchema = z.object({ reason: z.string().trim().max(300, "300 caractères maximum").default("") });

export async function getVerificationOverview(db: Db, actor: Actor): Promise<VerificationOverview> {
  const identity = await getAuthIdentity(db, actor.userId);
  const [latest] = await db
    .select({
      method: verifications.method,
      status: verifications.status,
      rejectionReason: verifications.rejectionReason,
      createdAt: verifications.createdAt,
    })
    .from(verifications)
    .where(eq(verifications.userId, actor.userId))
    .orderBy(desc(verifications.createdAt))
    .limit(1);
  return {
    status: actor.verificationStatus,
    email: identity?.email ?? null,
    emailVerified: identity?.emailVerified ?? false,
    university: identity ? universityForEmail(identity.email) : null,
    latest: latest ?? null,
  };
}

export async function confirmUniversityEmail(db: Db, actor: Actor, now = new Date()): Promise<void> {
  assertCanSubmitVerification(actor);
  const identity = await getAuthIdentity(db, actor.userId);
  if (!identity) throw new DomainError("NOT_FOUND");
  const university = universityForEmail(identity.email);
  if (!university) throw new DomainError("NOT_UNIVERSITY_EMAIL");
  if (!identity.emailVerified) throw new DomainError("EMAIL_NOT_VERIFIED");
  await db.transaction(async (tx) => {
    await tx.insert(verifications).values({
      userId: actor.userId,
      method: "university_email",
      universityEmail: identity.email.trim().toLowerCase(),
      school: university,
      status: "approved",
      reviewedAt: now,
    });
    await tx.update(profiles).set({ verificationStatus: "verified" }).where(eq(profiles.userId, actor.userId));
  });
}

export async function submitStudentCard(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  raw: { school?: unknown; studentNumber?: unknown },
  file: CardFile,
): Promise<{ id: string }> {
  assertCanSubmitVerification(actor);
  const input = cardSchema.parse({ ...raw, card: { type: file.type, size: file.size } });
  const key = `cards/${actor.userId}/${crypto.randomUUID()}.${cardExtension(file.type)}`;
  await storage.put(key, file.bytes, file.type);
  try {
    return await db.transaction(async (tx) => {
      // Verrou sur le profil : deux envois simultanés ne créent qu'une demande.
      const [fresh] = await tx.select().from(profiles).where(eq(profiles.userId, actor.userId)).for("update");
      if (!fresh) throw new DomainError("NOT_FOUND");
      assertCanSubmitVerification(fresh);
      const [row] = await tx
        .insert(verifications)
        .values({
          userId: actor.userId,
          method: "card",
          school: schoolLabel(input.school),
          studentNumber: input.studentNumber,
          cardObjectKey: key,
        })
        .returning({ id: verifications.id });
      await tx.update(profiles).set({ verificationStatus: "pending" }).where(eq(profiles.userId, actor.userId));
      return row;
    });
  } catch (error) {
    await storage.delete(key).catch((e) => console.warn("[verification] photo orpheline non supprimée", key, e));
    throw error;
  }
}

export async function listPendingCards(db: Db, storage: CardStorage, actor: Actor): Promise<PendingCard[]> {
  assertIsAdmin(actor);
  const rows = await db
    .select({
      id: verifications.id,
      firstName: profiles.firstName,
      school: verifications.school,
      studentNumber: verifications.studentNumber,
      createdAt: verifications.createdAt,
      cardObjectKey: verifications.cardObjectKey,
    })
    .from(verifications)
    .innerJoin(profiles, eq(profiles.userId, verifications.userId))
    .where(and(eq(verifications.method, "card"), eq(verifications.status, "pending")))
    .orderBy(asc(verifications.createdAt));
  return Promise.all(
    rows.map(async ({ cardObjectKey, ...row }) => ({
      ...row,
      imageUrl: cardObjectKey ? await storage.signedUrl(cardObjectKey, SIGNED_URL_SECONDS) : null,
      viewableInBrowser: !/\.(heic|heif)$/i.test(cardObjectKey ?? ""),
    })),
  );
}

export async function reviewCard(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  verificationId: string,
  decision: "approve" | "reject",
  raw: { reason?: unknown },
  now = new Date(),
): Promise<void> {
  assertIsAdmin(actor);
  const { reason } = reviewSchema.parse(raw);
  if (decision === "reject") {
    z.object({ reason: z.string().min(3, "Indiquez le motif du refus (3 caractères minimum)") }).parse({ reason });
  }
  if (!isUuid(verificationId)) throw new DomainError("NOT_FOUND");
  const key = await db.transaction(async (tx) => {
    const [v] = await tx.select().from(verifications).where(eq(verifications.id, verificationId)).for("update");
    if (!v) throw new DomainError("NOT_FOUND");
    if (v.status !== "pending") throw new DomainError("INVALID_TRANSITION");
    await tx
      .update(verifications)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        rejectionReason: decision === "reject" ? reason : null,
        reviewedBy: actor.userId,
        reviewedAt: now,
        cardObjectKey: null,
      })
      .where(eq(verifications.id, verificationId));
    await tx
      .update(profiles)
      .set({ verificationStatus: decision === "approve" ? "verified" : "rejected" })
      .where(eq(profiles.userId, v.userId));
    return v.cardObjectKey;
  });
  // La photo n'est plus utile une fois la décision prise (spec §9).
  if (key) await storage.delete(key).catch((e) => console.warn("[verification] photo non supprimée", key, e));
}
