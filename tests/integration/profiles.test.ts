import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createProfile } from "@/server/profiles/service";
import { closeDb, db, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("createProfile", () => {
  it("crée un étudiant non vérifié avec son école", async () => {
    const p = await createProfile(db, "u1", { role: "student", firstName: " Léa ", school: "Université de Bordeaux" });
    expect(p).toMatchObject({ userId: "u1", role: "student", firstName: "Léa", verificationStatus: "none", school: "Université de Bordeaux" });
  });

  it("crée un hôte sans école", async () => {
    const p = await createProfile(db, "u2", { role: "host", firstName: "Mireille", school: "ignorée" });
    expect(p.role).toBe("host");
    expect(p.school).toBeNull();
  });

  it("exige une école pour un étudiant", async () => {
    await expect(createProfile(db, "u3", { role: "student", firstName: "Léa", school: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("refuse de créer un admin depuis le formulaire", async () => {
    await expect(createProfile(db, "u4", { role: "admin", firstName: "X", school: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("est idempotent : un second appel renvoie le profil existant", async () => {
    await createProfile(db, "u5", { role: "host", firstName: "Jean", school: "" });
    const again = await createProfile(db, "u5", { role: "student", firstName: "Autre", school: "École" });
    expect(again).toMatchObject({ role: "host", firstName: "Jean" });
  });
});
