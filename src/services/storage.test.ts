import { describe, expect, it } from "vitest";
import { createMemoryStorage, storageConfigFromEnv } from "./storage";

describe("createMemoryStorage", () => {
  it("stocke, signe et supprime un objet", async () => {
    const storage = createMemoryStorage();
    await storage.put("cards/u1/a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(storage.objects.get("cards/u1/a.jpg")?.contentType).toBe("image/jpeg");
    expect(await storage.signedUrl("cards/u1/a.jpg", 300)).toContain("cards/u1/a.jpg");
    await storage.put("cards/u2/b.jpg", new Uint8Array([1]), "image/jpeg");
    await storage.put("checks/x.txt", new Uint8Array([1]), "text/plain");
    expect(await storage.list("cards/")).toEqual(["cards/u1/a.jpg", "cards/u2/b.jpg"]);
    await storage.delete("cards/u1/a.jpg");
    expect(await storage.list("cards/")).toEqual(["cards/u2/b.jpg"]);
    expect(storage.objects.size).toBe(2);
  });
});

describe("storageConfigFromEnv", () => {
  it("lit les variables NEON_STORAGE_* et signale celle qui manque", () => {
    const env = {
      NEON_STORAGE_ENDPOINT: "https://e",
      NEON_STORAGE_REGION: "eu-central-1",
      NEON_STORAGE_ACCESS_KEY_ID: "id",
      NEON_STORAGE_SECRET_ACCESS_KEY: "secret",
      NEON_STORAGE_BUCKET: "student-cards",
    };
    expect(storageConfigFromEnv(env)).toEqual({
      endpoint: "https://e",
      region: "eu-central-1",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "student-cards",
    });
    expect(() => storageConfigFromEnv({ ...env, NEON_STORAGE_BUCKET: "" })).toThrow("NEON_STORAGE_BUCKET");
  });
});
