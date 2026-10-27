import { expect, type Browser, type Page } from "@playwright/test";

export const E2E_PASSWORD = "MotDePasseE2e2026";

export function uniqueEmail(tag: string): string {
  return `e2e+${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
}

export async function newActor(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function signUp(page: Page, user: { firstName: string; email: string; role: "student" | "host"; school?: string }) {
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill(user.firstName);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel(/Mot de passe/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Bienvenue sur Ocleans" })).toBeVisible();
  await page.locator(`input[name=role][value=${user.role}]`).check();
  if (user.school) await page.getByLabel(/Établissement/).fill(user.school);
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function quickLogin(page: Page, label: RegExp) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: label }).click();
}
