import { expect, test } from "@playwright/test";
import { newActor, quickLogin, signUp, uniqueEmail } from "./helpers";

test("l'hôte annule un repas : l'étudiante est prévenue, avec le motif", async ({ browser }) => {
  const title = `Soupe e2e ${Date.now()}`;
  const host = await newActor(browser);
  await signUp(host, { firstName: "Hôtesse", email: uniqueEmail("hotesse"), role: "host" });
  await host.getByRole("link", { name: "Proposer un repas" }).click();
  const inThreeDays = new Date(Date.now() + 3 * 24 * 3600_000).toISOString().slice(0, 10);
  await host.getByLabel("Plat proposé").fill(title);
  await host.getByLabel("Description").fill("Une soupe préparée pour les tests de bout en bout.");
  await host.getByLabel("Date et heure du repas").fill(`${inThreeDays}T12:30`);
  await host.getByLabel(/Quartier/).selectOption("Talence");
  await host.getByLabel("Adresse exacte").fill("2 rue de test, 33400 Talence");
  await host.getByRole("button", { name: "Publier le repas" }).click();
  await expect(host.getByRole("heading", { name: title })).toBeVisible();

  const student = await newActor(browser);
  await signUp(student, { firstName: "Camille", email: uniqueEmail("camille"), role: "student", school: "Bordeaux INP" });
  await expect(student.getByRole("heading", { name: "Vérifier mon statut étudiant" })).toBeVisible();
  await student.getByLabel("Établissement").selectOption({ label: "Bordeaux INP" });
  await student.getByLabel("Numéro étudiant").fill("E2E67890");
  await student.getByLabel(/Photo de votre carte/).setInputFiles("tests/e2e/fixtures/carte.png");
  await student.getByRole("button", { name: "Envoyer ma carte" }).click();
  const admin = await newActor(browser);
  await quickLogin(admin, /Admin Ocleans/);
  await admin.locator(".rounded-xl", { hasText: "Camille" }).getByRole("button", { name: "Valider la carte" }).click();
  await expect(admin.locator(".rounded-xl", { hasText: "Camille" })).toHaveCount(0);

  await student.goto("/repas");
  await student.getByRole("link", { name: new RegExp(title) }).click();
  await student.getByRole("button", { name: "Demander à partager ce repas" }).click();
  await expect(student.getByText("En attente")).toBeVisible();

  await host.goto("/hote/offres");
  const mealCard = host.locator(".rounded-xl", { hasText: title }).first();
  await mealCard.getByText("Annuler ce repas").click();
  await mealCard.getByLabel(/Raison/).fill("Imprévu de dernière minute");
  await mealCard.getByRole("button", { name: "Confirmer l'annulation du repas" }).click();
  await expect(host.getByText("Repas annulé.")).toBeVisible();

  await student.goto("/notifications");
  await expect(student.getByText(`« ${title} » est annulé par l'hôte : Imprévu de dernière minute`)).toBeVisible();
  await student.goto("/repas");
  await expect(student.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
});
