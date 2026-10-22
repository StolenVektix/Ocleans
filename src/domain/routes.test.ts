import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./routes";

describe("isProtectedPath", () => {
  it("protège les espaces étudiant, hôte et le choix du profil", () => {
    expect(isProtectedPath("/etudiant/mes-repas")).toBe(true);
    expect(isProtectedPath("/hote/offres")).toBe(true);
    expect(isProtectedPath("/hote")).toBe(true);
    expect(isProtectedPath("/bienvenue")).toBe(true);
    expect(isProtectedPath("/admin/verifications")).toBe(true);
  });

  it("laisse publiques l'accueil, les repas et l'authentification", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/repas")).toBe(false);
    expect(isProtectedPath("/repas/123")).toBe(false);
    expect(isProtectedPath("/connexion")).toBe(false);
    expect(isProtectedPath("/hotels")).toBe(false);
    expect(isProtectedPath("/administration")).toBe(false);
  });
});
