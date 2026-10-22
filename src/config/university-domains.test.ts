import { describe, expect, it } from "vitest";
import { emailDomain, universityForEmail } from "./university-domains";

describe("universityForEmail", () => {
  it("reconnaît une adresse étudiante de l'Université de Bordeaux, casse et espaces compris", () => {
    expect(universityForEmail("lea.martin@etu.u-bordeaux.fr")).toBe("Université de Bordeaux");
    expect(universityForEmail("  Lea.Martin@ETU.U-Bordeaux.fr ")).toBe("Université de Bordeaux");
  });

  it("refuse les adresses du personnel et les domaines trompeurs", () => {
    expect(universityForEmail("prof@u-bordeaux.fr")).toBeNull();
    expect(universityForEmail("x@etu.u-bordeaux.fr.evil.com")).toBeNull();
    expect(universityForEmail("x@evil-etu.u-bordeaux.fr")).toBeNull();
    expect(universityForEmail("x@sub.etu.u-bordeaux.fr")).toBeNull();
    expect(universityForEmail("constructor@toString")).toBeNull();
    expect(universityForEmail("pas-une-adresse")).toBeNull();
  });
});

describe("emailDomain", () => {
  it("extrait le domaine en minuscules", () => {
    expect(emailDomain("A@B.fr")).toBe("b.fr");
    expect(emailDomain("sans-arobase")).toBeNull();
    expect(emailDomain("fin@")).toBeNull();
  });
});
