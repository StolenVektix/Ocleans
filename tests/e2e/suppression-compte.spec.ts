import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, newActor, signUp, uniqueEmail } from "./helpers";

test("un utilisateur supprime son compte et ne peut plus se connecter", async ({ browser }) => {
  const email = uniqueEmail("depart");
  const page = await newActor(browser);
  await signUp(page, { firstName: "Partant", email, role: "host" });
  await page.goto("/compte");
  await page.getByLabel("Tapez SUPPRIMER pour confirmer").fill("supprimer");
  await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(page.getByText("Tapez SUPPRIMER en majuscules pour confirmer")).toBeVisible();
  await page.getByLabel("Tapez SUPPRIMER pour confirmer").fill("SUPPRIMER");
  await page.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await page.waitForURL("**/");
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
});
