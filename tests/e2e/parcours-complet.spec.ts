import { expect, test } from "@playwright/test";
import { newActor, quickLogin, signUp, uniqueEmail } from "./helpers";

test("un hôte publie, un étudiant se vérifie par carte, demande, est accepté et échange un message", async ({ browser }) => {
  const title = `Gratin e2e ${Date.now()}`;
  const host = await newActor(browser);
  await signUp(host, { firstName: "Hôte", email: uniqueEmail("hote"), role: "host" });
  await expect(host.getByRole("heading", { name: "Mes repas proposés" })).toBeVisible();
  await host.getByRole("link", { name: "Proposer un repas" }).click();
  const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);
  await host.getByLabel("Plat proposé").fill(title);
  await host.getByLabel("Description").fill("Un gratin préparé pour les tests de bout en bout.");
  await host.getByLabel("Date et heure du repas").fill(`${tomorrow}T19:30`);
  await host.getByLabel(/Quartier/).selectOption("Bastide");
  await host.getByLabel("Adresse exacte").fill("1 quai de test, 33100 Bordeaux");
  await host.getByRole("button", { name: "Publier le repas" }).click();
  await expect(host.getByRole("heading", { name: title })).toBeVisible();

  const student = await newActor(browser);
  await signUp(student, { firstName: "Étudiante", email: uniqueEmail("etudiante"), role: "student", school: "KEDGE" });
  await expect(student.getByRole("heading", { name: "Vérifier mon statut étudiant" })).toBeVisible();
  await student.getByLabel("Établissement").selectOption({ label: "KEDGE Business School" });
  await student.getByLabel("Numéro étudiant").fill("E2E12345");
  await student.getByLabel(/Photo de votre carte/).setInputFiles("tests/e2e/fixtures/carte.png");
  await student.getByRole("button", { name: "Envoyer ma carte" }).click();
  await expect(student.getByText("En cours de vérification")).toBeVisible();

  const admin = await newActor(browser);
  await quickLogin(admin, /Admin Ocleans/);
  await expect(admin.getByRole("heading", { name: /Cartes étudiantes à vérifier/ })).toBeVisible();
  await admin.locator(".rounded-xl", { hasText: "Étudiante" }).getByRole("button", { name: "Valider la carte" }).click();
  await expect(admin.locator(".rounded-xl", { hasText: "Étudiante" })).toHaveCount(0);

  await student.goto("/repas");
  await student.getByRole("link", { name: new RegExp(title) }).click();
  await expect(student.getByText("L'adresse exacte est communiquée une fois votre demande acceptée.")).toBeVisible();
  await expect(student.getByText("1 quai de test")).toHaveCount(0);
  await student.getByRole("button", { name: "Demander à partager ce repas" }).click();
  await expect(student.getByText("En attente")).toBeVisible();

  await host.goto("/notifications");
  await expect(host.getByText(`Étudiante aimerait partager « ${title} »`)).toBeVisible();
  await host.goto("/hote/offres");
  await host.locator(".rounded-xl", { hasText: title }).getByRole("button", { name: "Accepter" }).click();
  await expect(host.locator(".rounded-xl", { hasText: title }).getByText("Acceptée")).toBeVisible();

  await student.goto("/etudiant/mes-repas");
  const card = student.locator(".rounded-xl", { hasText: title });
  await expect(card.getByText("1 quai de test, 33100 Bordeaux")).toBeVisible();
  await card.getByRole("link", { name: "Messages" }).click();
  await student.getByPlaceholder("Votre message…").fill("Bonjour, à demain !");
  await student.getByRole("button", { name: "Envoyer" }).click();
  await expect(student.getByText("Bonjour, à demain !")).toBeVisible();

  await host.goto(student.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(host.getByText("Bonjour, à demain !")).toBeVisible();
});
