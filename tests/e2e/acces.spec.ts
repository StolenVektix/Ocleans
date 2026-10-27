import { expect, test } from "@playwright/test";

test("les pages protégées renvoient vers la connexion, les pages publiques s'affichent", async ({ page }) => {
  for (const path of ["/hote/offres", "/etudiant/mes-repas", "/admin/verifications", "/notifications", "/compte"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/connexion/);
  }
  await page.goto("/repas?vue=carte");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.goto("/donnees-personnelles");
  await expect(page.getByRole("heading", { name: "Données personnelles" })).toBeVisible();
  await page.goto("/n-existe-pas");
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});
