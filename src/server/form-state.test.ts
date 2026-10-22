import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { toFormStateOrRetry } from "./form-state";

describe("toFormStateOrRetry", () => {
  it("garde les erreurs métier et de validation telles quelles", () => {
    expect(toFormStateOrRetry(new DomainError("FORBIDDEN"), {}, "Réessayez.").error).toBe("Vous n'avez pas le droit de faire cette action.");
    const zodError = z.object({ a: z.string().min(2, "trop court") }).safeParse({ a: "x" }).error;
    expect(toFormStateOrRetry(zodError, {}, "Réessayez.").fieldErrors?.a).toEqual(["trop court"]);
  });

  it("transforme une panne (stockage, réseau) en message de nouvel essai, valeurs conservées", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = toFormStateOrRetry(new Error("ECONNRESET"), { school: "kedge" }, "Envoi impossible pour le moment. Réessayez.");
    expect(state).toEqual({ error: "Envoi impossible pour le moment. Réessayez.", values: { school: "kedge" } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
