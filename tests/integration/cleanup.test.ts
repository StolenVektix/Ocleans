import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications, profiles, verifications } from "@/db/schema";
import { EXPIRED_CARD_REASON, cleanupStaleCards } from "@/server/cleanup";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600_000;
const png = { type: "image/png", size: 10, bytes: new Uint8Array(10) };
const card = { school: "kedge", studentNumber: "12345678" };

beforeEach(resetDb);
afterAll(closeDb);

describe("cleanupStaleCards", () => {
  it("expire une demande de plus de 30 jours, garde une demande récente, supprime une photo orpheline", async () => {
    const storage = createMemoryStorage();
    const oldId = await makeAuthUser("old@gmail.com");
    const oldStudent = await makeProfile({ userId: oldId, verificationStatus: "none" });
    const recentId = await makeAuthUser("recent@gmail.com");
    const recentStudent = await makeProfile({ userId: recentId, verificationStatus: "none" });
    const old = await submitStudentCard(db, storage, oldStudent, card, png);
    await db.update(verifications).set({ createdAt: new Date(Date.now() - 31 * DAY) }).where(eq(verifications.id, old.id));
    const recent = await submitStudentCard(db, storage, recentStudent, card, png);
    await storage.put("cards/fantome/perdue.png", new Uint8Array([1]), "image/png");

    expect(await cleanupStaleCards(db, storage)).toEqual({ expired: 1, orphansDeleted: 1 });
    const [notice] = await db.select().from(notifications).where(eq(notifications.userId, oldStudent.userId));
    expect(notice).toMatchObject({ type: "verification_rejected", title: "Vérification expirée", link: "/etudiant/verification" });

    const [o] = await db.select().from(verifications).where(eq(verifications.id, old.id));
    expect(o).toMatchObject({ status: "rejected", rejectionReason: EXPIRED_CARD_REASON, cardObjectKey: null });
    const [op] = await db.select().from(profiles).where(eq(profiles.userId, oldStudent.userId));
    expect(op.verificationStatus).toBe("rejected");
    const [r] = await db.select().from(verifications).where(eq(verifications.id, recent.id));
    expect(r.status).toBe("pending");
    expect(await storage.list("cards/")).toEqual([r.cardObjectKey]);
    expect(await cleanupStaleCards(db, storage)).toEqual({ expired: 0, orphansDeleted: 0 });
  });

  it("continue le balayage quand une photo orpheline ne se supprime pas", async () => {
    const storage = createMemoryStorage();
    await storage.put("cards/a.png", new Uint8Array(1), "image/png");
    await storage.put("cards/b.png", new Uint8Array(1), "image/png");
    const failing = { ...storage, delete: async (key: string) => { if (key === "cards/a.png") throw new Error("S3"); await storage.delete(key); } };
    expect(await cleanupStaleCards(db, failing)).toEqual({ expired: 0, orphansDeleted: 1 });
    expect(await storage.list("cards/")).toEqual(["cards/a.png"]);
  });
});
