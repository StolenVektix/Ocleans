import { describe, expect, it } from "vitest";
import { isE2eEmail } from "./e2e-accounts";

describe("isE2eEmail", () => {
  it("n'accepte que les adresses de test e2e", () => {
    expect(isE2eEmail("e2e+hote-1761140000@example.com")).toBe(true);
    expect(isE2eEmail("lea.demo@example.com")).toBe(false);
    expect(isE2eEmail("e2e@example.com")).toBe(false);
    expect(isE2eEmail("e2e+x@exemple.fr")).toBe(false);
    expect(isE2eEmail("E2E+X@EXAMPLE.COM")).toBe(false);
    expect(isE2eEmail("e2e+x@example.com.evil.fr")).toBe(false);
    expect(isE2eEmail("vrai.etudiant@etu.u-bordeaux.fr")).toBe(false);
  });
});
