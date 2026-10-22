import { describe, expect, it } from "vitest";
import { createDb } from "./client";

describe("createDb", () => {
  it("écoute les erreurs du pool pour qu'une connexion inactive coupée ne fasse pas planter le processus", async () => {
    const db = createDb("postgresql://user:pass@localhost:5432/db");
    expect(db.$client.listenerCount("error")).toBeGreaterThan(0);
    await db.$client.end();
  });
});
