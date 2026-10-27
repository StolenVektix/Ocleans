# Ocleans — Plan 4 : sécurité, RGPD, finitions et tests de bout en bout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ce plan termine le prototype. Il ajoute :
- des limites anti-abus ;
- une page « Données personnelles » ;
- la suppression de compte, avec anonymisation ;
- le nettoyage automatique des photos de carte ;
- les principaux correctifs reportés des plans précédents ;
- des tests de bout en bout Playwright qui rejouent les parcours clés dans un vrai navigateur.

**Architecture:**
- **Limites** : comptages en base (lignes créées par l'acteur dans une fenêtre de temps), vérifiés par une règle pure, sans infrastructure supplémentaire.
- **Suppression de compte** : le profil devient une **pierre tombale** anonymisée (`deleted_at`, prénom « Utilisateur supprimé »). Ainsi les messages et les avis restent lisibles par l'autre personne, sans plus rien désigner. Les données de vérification et les photos sont effacées, les repas et demandes à venir sont annulés (avec notification), puis l'utilisateur Neon Auth est supprimé, ce qui efface en cascade ses sessions et comptes de connexion.
- **Nettoyage** : il s'ajoute au cron quotidien et reste lançable à la main (`npm run cleanup`).
- **Tests de bout en bout** : `@playwright/test` lance le serveur de dev sur la branche `demo`, chaque acteur dans son propre contexte de navigateur. Tous les comptes créés ont un email `e2e+…@example.com` et sont supprimés à la fin.

**Tech Stack:** Next.js 16, Neon Postgres + Drizzle, Neon Auth, Neon Object Storage, Vitest, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md` (§8, §9, §11, §13 étapes 5 et 6)

**Décisions propres à ce plan :**
- **Limites** :
  - 10 demandes de repas par 24 h ;
  - 30 messages par minute ;
  - 5 signalements par 24 h ;
  - 3 envois de carte étudiante par 24 h (ajout, pour éviter de remplir le bucket) ;
  - les codes email restent limités par Neon Auth (spec §4).
- **Suppression de compte** : l'utilisateur Neon Auth est supprimé directement dans `neon_auth."user"` (même base, cascade vérifiée sur `session` et `account`). Le profil est conservé sous forme anonymisée, parce que les messages, avis et signalements y sont liés.
- **Photos en attente depuis plus de 30 jours** : la demande passe `rejected`, avec le motif « Demande expirée, merci de renvoyer votre carte », et la photo est supprimée. Le même nettoyage supprime aussi les photos du préfixe `cards/` qui ne sont plus référencées par une demande en attente (photos orphelines).
- **Scénario 3 de la spec §11** : on ne peut pas lire le code de vérification d'email dans les journaux, puisque c'est Neon Auth qui l'envoie. Il est remplacé par un scénario « annulation et notifications », et un quatrième scénario couvre la suppression de compte.
- **Correctifs reportés retenus** (effet visible pour une personne) :
  - un rappel est renvoyé quand la date du repas change ;
  - les notifications à l'hôte lors d'une suspension portent le titre du repas, une par demande ;
  - le message « Ce signalement a déjà été traité » remplace « Cette demande a déjà reçu une réponse » ;
  - un rappel n'est pas envoyé par email si la réservation n'est plus acceptée ;
  - les liens des emails ne pointent plus vers localhost en mode Resend ;
  - une conversation fermée et vide n'affiche plus « Présentez-vous » ;
  - `bodySizeLimit` passe à `4.2mb` ;
  - après un échec de connexion, l'en-tête est rafraîchi.

## Global Constraints

- Toutes les contraintes globales des plans précédents restent valables : interface en français, Next.js 16, Drizzle sans `db.query.*`, aucun secret committé, commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Un dépassement de limite renvoie l'erreur métier `RATE_LIMITED`, avec un message en français qui indique quand réessayer. Il n'écrit jamais rien en base.
- Une suppression de compte est **irréversible** : elle exige de taper `SUPPRIMER`. Après elle, aucune donnée ne permet d'identifier la personne : ni prénom, ni école, ni bio, ni email dans nos tables, ni photo, ni numéro étudiant.
- Le nettoyage ne supprime jamais une photo référencée par une demande `pending` de moins de 30 jours.
- Les tests de bout en bout n'utilisent que des comptes `e2e+…@example.com` et le compte admin de démo. Ils nettoient tout ce qu'ils créent, et le nettoyage ne touche **que** ces adresses.

## Review Focus

1. **Spam de demandes** : à la 11e demande en 24 h, le message « Vous avez atteint la limite… » s'affiche, et aucune ligne n'est créée. Les demandes plus anciennes que 24 h ne comptent pas. Test en Task 1.
2. **Suppression d'un hôte avec un repas à venir et des étudiants acceptés** : le repas est annulé, les étudiants reçoivent « Repas annulé », et leurs messages passés affichent « Utilisateur supprimé ». La personne ne peut plus se connecter. Tests en Task 3 et Task 7.
3. **Photo d'une demande de moins de 30 jours** : le nettoyage la conserve. Une photo orpheline est supprimée, et une demande de 31 jours est expirée. Test en Task 4.
4. **Nettoyage des tests de bout en bout** : il ne supprime aucun compte de démo ni aucun vrai compte, même si un email ressemble à `e2e…@exemple.fr`. Test en Task 6.
5. **Rappel après un changement de date** : si l'hôte décale le repas d'une semaine après l'envoi du rappel, un nouveau rappel part la veille de la nouvelle date. Test en Task 5.

---

## Structure des fichiers

```
src/domain/rate-limits.ts              limites et règle assertUnderLimit
src/server/rate-limits.ts              comptages en base
src/app/donnees-personnelles/page.tsx  page RGPD
src/components/site-footer.tsx         pied de page (lien RGPD)
src/server/account/service.ts          deleteAccount
src/server/account/actions.ts, src/app/compte/page.tsx, src/components/delete-account-form.tsx
src/server/cleanup.ts                  cleanupStaleCards
scripts/cleanup.ts                     nettoyage manuel
playwright.config.ts, tests/e2e/*      tests de bout en bout
scripts/e2e-cleanup.ts                 suppression des comptes e2e
```

---

### Task 1: Limites anti-abus

**Files:**
- Create: `src/domain/rate-limits.ts`, `src/server/rate-limits.ts`
- Modify: `src/domain/errors.ts`, `src/server/bookings/service.ts` (`requestBooking`), `src/server/messages/service.ts` (`postMessage`), `src/server/reports/service.ts` (`createReport`), `src/server/verification/service.ts` (`submitStudentCard`)
- Test: `src/domain/rate-limits.test.ts`, `tests/integration/rate-limits.test.ts`

**Interfaces:**
- Produces:
  - Code d'erreur `RATE_LIMITED` (message « Vous avez atteint la limite pour le moment. Réessayez plus tard. »)
  - `RATE_LIMITS = { bookingRequests: { max: 10, windowMs: 24 h }, messages: { max: 30, windowMs: 60 s }, reports: { max: 5, windowMs: 24 h }, cardSubmissions: { max: 3, windowMs: 24 h } }`, `type RateLimitKey`
  - `assertUnderLimit(key: RateLimitKey, recentCount: number): void`
  - `countRecent(db: Db | Tx, key: RateLimitKey, userId: string, now: Date): Promise<number>`

- [ ] **Step 1: Test unitaire (échoue)**

`src/domain/rate-limits.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { RATE_LIMITS, assertUnderLimit } from "./rate-limits";

describe("assertUnderLimit", () => {
  it("laisse passer sous la limite et bloque à la limite", () => {
    expect(() => assertUnderLimit("bookingRequests", RATE_LIMITS.bookingRequests.max - 1)).not.toThrow();
    expect(() => assertUnderLimit("bookingRequests", RATE_LIMITS.bookingRequests.max)).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });

  it("fixe les limites de la spec", () => {
    expect(RATE_LIMITS.bookingRequests).toEqual({ max: 10, windowMs: 24 * 3600_000 });
    expect(RATE_LIMITS.messages).toEqual({ max: 30, windowMs: 60_000 });
    expect(RATE_LIMITS.reports).toEqual({ max: 5, windowMs: 24 * 3600_000 });
    expect(RATE_LIMITS.cardSubmissions).toEqual({ max: 3, windowMs: 24 * 3600_000 });
  });
});
```

Run: `npm test -- src/domain/rate-limits.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Règle et code d'erreur**

Dans `src/domain/errors.ts`, ajouter `| "RATE_LIMITED"` à l'union, et dans `MESSAGES` :

```ts
  RATE_LIMITED: "Vous avez atteint la limite pour le moment. Réessayez plus tard.",
```

`src/domain/rate-limits.ts` :

```ts
import { DomainError } from "./errors";

const HOUR = 3600_000;

// Spec §9 (et cartes étudiantes : 3 par jour pour éviter de remplir le stockage).
export const RATE_LIMITS = {
  bookingRequests: { max: 10, windowMs: 24 * HOUR },
  messages: { max: 30, windowMs: 60_000 },
  reports: { max: 5, windowMs: 24 * HOUR },
  cardSubmissions: { max: 3, windowMs: 24 * HOUR },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

export function assertUnderLimit(key: RateLimitKey, recentCount: number): void {
  if (recentCount >= RATE_LIMITS[key].max) throw new DomainError("RATE_LIMITED");
}
```

Run: `npm test -- src/domain/rate-limits.test.ts`
Expected: PASS.

- [ ] **Step 3: Test d'intégration (échoue)**

`tests/integration/rate-limits.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, messages, reports } from "@/db/schema";
import { requestBooking } from "@/server/bookings/service";
import { postMessage } from "@/server/messages/service";
import { createReport } from "@/server/reports/service";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("limites anti-abus", () => {
  it("bloque la 11e demande en 24 h sans rien créer, et ignore les demandes plus anciennes", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const old = await makeMeal(host.userId);
    const oldBooking = await makeBooking(old.id, student.userId, "declined");
    await db.update(bookings).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(bookings.id, oldBooking.id));
    for (let i = 0; i < 10; i++) {
      const meal = await makeMeal(host.userId, { title: `Repas ${i}` });
      await requestBooking(db, student, meal.id, {});
    }
    const eleventh = await makeMeal(host.userId);
    await expect(requestBooking(db, student, eleventh.id, {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await db.select().from(bookings).where(eq(bookings.mealId, eleventh.id))).toHaveLength(0);
  });

  it("bloque le 31e message en une minute", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    await db.insert(messages).values(Array.from({ length: 30 }, (_, i) => ({ bookingId: booking.id, senderId: student.userId, body: `m${i}` })));
    await expect(postMessage(db, student, booking.id, { body: "encore" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await postMessage(db, host, booking.id, { body: "l'hôte peut encore écrire" });
  });

  it("bloque le 6e signalement en 24 h", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    await db.insert(reports).values(Array.from({ length: 5 }, () => ({ reporterId: student.userId, reportedUserId: host.userId, bookingId: booking.id, reason: "Signalement de test" })));
    await expect(createReport(db, student, booking.id, { reason: "Encore un signalement" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("bloque le 4e envoi de carte en 24 h", async () => {
    const storage = createMemoryStorage();
    const userId = await makeAuthUser("chloe@gmail.com");
    let student = await makeProfile({ userId, verificationStatus: "none" });
    const { reviewCard } = await import("@/server/verification/service");
    const admin = await makeProfile({ role: "admin" });
    for (let i = 0; i < 3; i++) {
      const { id } = await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
      await reviewCard(db, storage, admin, id, "reject", { reason: "Illisible" });
      student = { ...student, verificationStatus: "rejected" };
    }
    await expect(
      submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(storage.objects.size).toBe(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/rate-limits.test.ts`
Expected: FAIL (aucune limite appliquée).

- [ ] **Step 4: Comptages**

`src/server/rate-limits.ts` :

```ts
import { and, count, eq, gt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookings, messages, reports, verifications } from "@/db/schema";
import { RATE_LIMITS, type RateLimitKey } from "@/domain/rate-limits";
import type { Tx } from "@/server/meals/service";

export async function countRecent(db: Db | Tx, key: RateLimitKey, userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - RATE_LIMITS[key].windowMs);
  const query = {
    bookingRequests: () => db.select({ n: count() }).from(bookings).where(and(eq(bookings.studentId, userId), gt(bookings.createdAt, since))),
    messages: () => db.select({ n: count() }).from(messages).where(and(eq(messages.senderId, userId), gt(messages.createdAt, since))),
    reports: () => db.select({ n: count() }).from(reports).where(and(eq(reports.reporterId, userId), gt(reports.createdAt, since))),
    cardSubmissions: () =>
      db.select({ n: count() }).from(verifications).where(and(eq(verifications.userId, userId), eq(verifications.method, "card"), gt(verifications.createdAt, since))),
  }[key];
  const [row] = await query();
  return Number(row?.n ?? 0);
}
```

- [ ] **Step 5: Appliquer les limites**

Dans chaque service, importer `assertUnderLimit` (`@/domain/rate-limits`) et `countRecent` (`@/server/rate-limits`), puis ajouter :
1. `requestBooking`, dans la transaction, juste après `if (!meal) throw …` : `assertUnderLimit("bookingRequests", await countRecent(tx, "bookingRequests", actor.userId, now));`
2. `postMessage`, juste avant l'`insert` : `assertUnderLimit("messages", await countRecent(db, "messages", actor.userId, now));`
3. `createReport`, juste après `assertCanReport(...)` : `assertUnderLimit("reports", await countRecent(db, "reports", actor.userId, new Date()));`
4. `submitStudentCard`, juste après `const input = cardSchema.parse(...)` et **avant** `storage.put` : `assertUnderLimit("cardSubmissions", await countRecent(db, "cardSubmissions", actor.userId, new Date()));`

- [ ] **Step 6: Lancer**

Run: `npx tsc --noEmit && npm test && npm run test:integration`
Expected: PASS (toutes les suites).

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat: limites anti-abus (demandes, messages, signalements, cartes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Page « Données personnelles » et pied de page

**Files:**
- Create: `src/app/donnees-personnelles/page.tsx`, `src/components/site-footer.tsx`
- Modify: `src/app/layout.tsx`, `src/components/card-form.tsx`

**Interfaces:**
- Produces: la route publique `/donnees-personnelles`, et un pied de page sur toutes les pages.

- [ ] **Step 1: Page**

`src/app/donnees-personnelles/page.tsx` :

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Données personnelles — Ocleans" };

const ROWS = [
  { data: "Email et mot de passe (chiffré)", why: "Vous connecter", how: "Jusqu'à la suppression du compte" },
  { data: "Prénom, rôle, établissement, courte bio", why: "Présenter les hôtes et les étudiants", how: "Jusqu'à la suppression du compte" },
  { data: "Repas proposés, adresse exacte", why: "Organiser les repas ; l'adresse n'est donnée qu'aux étudiants acceptés", how: "Jusqu'à la suppression du compte" },
  { data: "Demandes, messages, avis, signalements", why: "Faire fonctionner les échanges et la modération", how: "Anonymisés à la suppression du compte" },
  { data: "Photo de carte étudiante", why: "Vérifier le statut étudiant", how: "Supprimée dès la décision, au plus tard après 30 jours" },
  { data: "Numéro étudiant et établissement", why: "Garder la preuve de la vérification", how: "Supprimés avec le compte" },
  { data: "Notifications", why: "Vous prévenir des événements qui vous concernent", how: "Supprimées avec le compte" },
];

export default function PersonalDataPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Données personnelles</h1>
      <p className="text-stone-700">
        Ocleans est un prototype de mise en relation entre habitants et étudiants à Bordeaux. Nous ne collectons que ce qui est nécessaire
        pour organiser des repas partagés en confiance. Rien n'est vendu ni utilisé à des fins publicitaires.
      </p>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-stone-700">
            <tr>
              <th className="p-3">Donnée</th>
              <th className="p-3">Pourquoi</th>
              <th className="p-3">Combien de temps</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.data} className="border-t border-stone-100 align-top">
                <td className="p-3 font-medium">{r.data}</td>
                <td className="p-3">{r.why}</td>
                <td className="p-3">{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Où sont vos données ?</h2>
        <p className="text-stone-700">
          Base de données et stockage des photos chez Neon (Union européenne, Francfort) ; application hébergée par Vercel.
          Les fonds de carte viennent d'OpenStreetMap, et la carte ne montre que le quartier, jamais l'adresse.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Vos droits</h2>
        <p className="text-stone-700">
          Vous pouvez à tout moment supprimer votre compte depuis la page « Mon compte ». Vos messages et avis restent lisibles par l'autre
          personne, mais signés « Utilisateur supprimé ». Pour toute autre demande (accès, rectification), contactez l'équipe Ocleans.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Pied de page**

`src/components/site-footer.tsx` :

```tsx
import Link from "next/link";
import { getCurrentProfile } from "@/server/session";

export async function SiteFooter() {
  const profile = await getCurrentProfile();
  return (
    <footer className="mx-auto mt-10 flex max-w-2xl flex-wrap gap-4 border-t border-stone-200 px-4 py-6 text-sm text-stone-500">
      <Link href="/donnees-personnelles" className="underline">Données personnelles</Link>
      {profile && <Link href="/compte" className="underline">Mon compte</Link>}
      <span>Ocleans · prototype · Bordeaux</span>
    </footer>
  );
}
```

Dans `src/app/layout.tsx`, importer `SiteFooter` et l'ajouter après `{children}`.

Dans `src/components/card-form.tsx`, à la fin du paragraphe d'information sur la photo, ajouter : ` <a href="/donnees-personnelles" className="underline">En savoir plus</a>`.

- [ ] **Step 3: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: tout passe, et `/donnees-personnelles` est listée.

Manuel (Playwright, 390×844) : la page s'affiche, le tableau défile horizontalement dans son cadre sans faire déborder la page, et le pied de page apparaît sur `/repas`.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat: page Données personnelles et pied de page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Suppression de compte

**Files:**
- Modify: `src/db/schema.ts` (`profiles.deletedAt`), `src/server/session.ts`, `tests/integration/helpers.ts`
- Create: `drizzle/0005_*.sql` (généré), `src/server/account/service.ts`, `src/server/account/actions.ts`, `src/components/delete-account-form.tsx`, `src/app/compte/page.tsx`
- Modify: `src/domain/routes.ts`, `src/domain/routes.test.ts`
- Test: `tests/integration/account.test.ts`

**Interfaces:**
- Consumes: `SUSPENSION_REASON`-like cascade logic (Plan 3a/3b) ; `queueNotifications` ; `CardStorage`.
- Produces:
  - Colonne `profiles.deleted_at` (timestamptz, nullable)
  - `DELETED_FIRST_NAME = "Utilisateur supprimé"`, `ACCOUNT_DELETED_REASON = "Compte supprimé"`
  - `deleteAccount(db, storage, actor, raw: { confirmation?: unknown }, now?): Promise<void>` (exige `confirmation === "SUPPRIMER"`)
  - `deleteAccountAction(prev, fd)`, route protégée `/compte`

- [ ] **Step 1: Schéma et migration**

Dans `src/db/schema.ts`, ajouter à `profiles` : `deletedAt: timestamp("deleted_at", { withTimezone: true }),`. Puis :

```bash
npm run db:generate && npm run db:migrate && npm run db:migrate:test
```

Expected: `drizzle/0005_*.sql` créé, et les migrations appliquées.

- [ ] **Step 2: Tests (échouent)**

`tests/integration/account.test.ts` :

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals, messages, notifications, profiles, reviews, verifications } from "@/db/schema";
import { ACCOUNT_DELETED_REASON, DELETED_FIRST_NAME, deleteAccount } from "@/server/account/service";
import { getThread } from "@/server/messages/service";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600_000;
const authUserExists = async (id: string) =>
  (await db.execute(sql`select 1 from neon_auth."user" where id::text = ${id}`)).rows.length > 0;

beforeEach(resetDb);
afterAll(closeDb);

describe("deleteAccount", () => {
  it("exige de taper SUPPRIMER", async () => {
    const userId = await makeAuthUser("a@example.com");
    const p = await makeProfile({ userId });
    await expect(deleteAccount(db, createMemoryStorage(), p, { confirmation: "supprimer" })).rejects.toBeInstanceOf(ZodError);
    expect(await authUserExists(userId)).toBe(true);
  });

  it("anonymise un hôte, annule ses repas à venir en prévenant les étudiants, et garde ses messages lisibles", async () => {
    const hostId = await makeAuthUser("mireille@example.com");
    const host = await makeProfile({ userId: hostId, role: "host", firstName: "Mireille", bio: "Ancienne prof" });
    const student = await makeProfile({ firstName: "Léa" });
    const future = await makeMeal(host.userId, { title: "Blanquette" });
    const past = await makeMeal(host.userId, { title: "Pot-au-feu", startsAt: new Date(Date.now() - DAY) });
    const futureBooking = await makeBooking(future.id, student.userId, "accepted");
    const pastBooking = await makeBooking(past.id, student.userId, "accepted");
    await db.insert(messages).values({ bookingId: pastBooking.id, senderId: host.userId, body: "Merci pour la soirée" });
    await db.insert(reviews).values({ bookingId: pastBooking.id, authorId: host.userId, targetId: student.userId, rating: 5, comment: "Super" });
    await db.insert(notifications).values({ userId: host.userId, type: "reminder", title: "x", body: "y", link: "/" });

    await deleteAccount(db, createMemoryStorage(), host, { confirmation: "SUPPRIMER" });

    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p).toMatchObject({ firstName: DELETED_FIRST_NAME, bio: "", school: null, suspended: true });
    expect(p.deletedAt).not.toBeNull();
    expect(await authUserExists(hostId)).toBe(false);
    const [m] = await db.select().from(meals).where(eq(meals.id, future.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, futureBooking.id));
    expect(b.status).toBe("cancelled");
    const [pm] = await db.select().from(meals).where(eq(meals.id, past.id));
    expect(pm.status).toBe("open");
    const studentInbox = await db.select().from(notifications).where(eq(notifications.userId, student.userId));
    expect(studentInbox.map((n) => n.type)).toEqual(["meal_cancelled"]);
    expect(await db.select().from(notifications).where(eq(notifications.userId, host.userId))).toHaveLength(0);
    const thread = await getThread(db, student, pastBooking.id);
    expect(thread?.otherFirstName).toBe(DELETED_FIRST_NAME);
    expect(thread?.messages[0]).toMatchObject({ body: "Merci pour la soirée", senderFirstName: DELETED_FIRST_NAME });
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("efface les données de vérification d'un étudiant, photo comprise, et annule ses demandes à venir", async () => {
    const storage = createMemoryStorage();
    const userId = await makeAuthUser("chloe@gmail.com");
    const student = await makeProfile({ userId, verificationStatus: "none", school: "KEDGE" });
    await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
    const host = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId, { title: "Couscous" });
    const booking = await makeBooking(meal.id, student.userId, "pending");

    await deleteAccount(db, storage, { ...student, verificationStatus: "pending" }, { confirmation: "SUPPRIMER" });

    expect(storage.objects.size).toBe(0);
    expect(await db.select().from(verifications)).toHaveLength(0);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON });
    const [hostNote] = await db.select().from(notifications).where(eq(notifications.userId, host.userId));
    expect(hostNote).toMatchObject({ type: "booking_cancelled" });
    expect(hostNote.body).toContain("Couscous");
    expect(hostNote.body).not.toContain("Test");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, student.userId));
    expect(p).toMatchObject({ firstName: DELETED_FIRST_NAME, school: null, verificationStatus: "none" });
  });
});
```

Run: `npm run test:integration -- tests/integration/account.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Service**

`src/server/account/service.ts` :

```ts
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, notifications, profiles, verifications } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import type { CardStorage } from "@/services/storage";
import { queueNotifications } from "@/server/notifications/service";

export const DELETED_FIRST_NAME = "Utilisateur supprimé";
export const ACCOUNT_DELETED_REASON = "Compte supprimé";

const confirmationSchema = z.object({
  confirmation: z.literal("SUPPRIMER", { error: "Tapez SUPPRIMER en majuscules pour confirmer" }),
});

export async function deleteAccount(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  raw: { confirmation?: unknown },
  now = new Date(),
): Promise<void> {
  confirmationSchema.parse(raw);
  const photoKeys = await db.transaction(async (tx) => {
    // Repas à venir de l'hôte : annulés, et les étudiants prévenus.
    const futureMeals = await tx
      .update(meals)
      .set({ status: "cancelled", cancelReason: ACCOUNT_DELETED_REASON })
      .where(and(eq(meals.hostId, actor.userId), eq(meals.status, "open"), gt(meals.startsAt, now)))
      .returning({ id: meals.id, title: meals.title });
    if (futureMeals.length > 0) {
      const affected = await tx
        .update(bookings)
        .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: ACCOUNT_DELETED_REASON })
        .where(and(inArray(bookings.mealId, futureMeals.map((m) => m.id)), inArray(bookings.status, ["pending", "accepted"])))
        .returning({ studentId: bookings.studentId, mealId: bookings.mealId });
      const titles = new Map(futureMeals.map((m) => [m.id, m.title]));
      await queueNotifications(
        tx,
        affected.map((b) => ({
          userId: b.studentId,
          type: "meal_cancelled" as const,
          title: "Repas annulé",
          body: `« ${titles.get(b.mealId)} » est annulé : l'hôte a quitté Ocleans.`,
          link: "/etudiant/mes-repas",
        })),
      );
    }

    // Demandes à venir de l'étudiant : annulées, et les hôtes prévenus.
    const upcoming = tx.select({ id: meals.id }).from(meals).where(gt(meals.startsAt, now));
    const myBookings = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: ACCOUNT_DELETED_REASON })
      .where(and(eq(bookings.studentId, actor.userId), inArray(bookings.status, ["pending", "accepted"]), inArray(bookings.mealId, upcoming)))
      .returning({ mealId: bookings.mealId });
    if (myBookings.length > 0) {
      const hostMeals = await tx
        .select({ hostId: meals.hostId, title: meals.title })
        .from(meals)
        .where(inArray(meals.id, myBookings.map((b) => b.mealId)));
      await queueNotifications(
        tx,
        hostMeals.map((m) => ({
          userId: m.hostId,
          type: "booking_cancelled" as const,
          title: "Une venue est annulée",
          body: `Un étudiant a quitté Ocleans : sa demande pour « ${m.title} » est annulée.`,
          link: "/hote/offres",
        })),
      );
    }

    // Données de vérification et notifications : effacées.
    const cards = await tx
      .delete(verifications)
      .where(eq(verifications.userId, actor.userId))
      .returning({ key: verifications.cardObjectKey });
    await tx.delete(notifications).where(eq(notifications.userId, actor.userId));

    // Pierre tombale : les messages, avis et signalements restent liés, sans rien qui identifie la personne.
    await tx
      .update(profiles)
      .set({ firstName: DELETED_FIRST_NAME, bio: "", school: null, verificationStatus: "none", suspended: true, deletedAt: now })
      .where(eq(profiles.userId, actor.userId));

    // Neon Auth : la suppression efface en cascade sessions et comptes de connexion.
    await tx.execute(sql`delete from neon_auth."user" where id::text = ${actor.userId}`);

    return cards.map((c) => c.key).filter((k): k is string => Boolean(k));
  });
  for (const key of photoKeys) await storage.delete(key).catch((e) => console.warn("[account] photo non supprimée", key, e));
}
```

- [ ] **Step 4: Session**

Dans `src/server/session.ts`, `getCurrentProfile` renvoie `null` si `profile.deletedAt` est défini, et `requireProfile` redirige alors vers `/` :

```ts
  if (!profile || profile.deletedAt) return null;
```

(dans `getCurrentProfile`), et dans `requireProfile`, juste après `if (!profile) redirect("/bienvenue");` :

```ts
  if (profile.deletedAt) redirect("/");
```

- [ ] **Step 5: Lancer**

Run: `npx tsc --noEmit && npm run test:integration`
Expected: PASS.

- [ ] **Step 6: Écran « Mon compte »**

Ajouter `"/compte"` à `PROTECTED_PREFIXES`, avec `expect(isProtectedPath("/compte")).toBe(true);` dans `routes.test.ts` (test d'abord, il doit échouer, puis passer).

`src/server/account/actions.ts` :

```ts
"use server";

import { getDb } from "@/db/client";
import { getCardStorage } from "@/services/storage";
import { formValues, toFormStateOrRetry, type FormState } from "@/server/form-state";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { requireProfile } from "@/server/session";
import { deleteAccount } from "./service";

export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await deleteAccount(getDb(), getCardStorage(), actor, values);
  } catch (error) {
    return toFormStateOrRetry(error, values, "La suppression n'a pas pu aboutir. Réessayez dans un instant.");
  }
  scheduleEmailDelivery();
  return { ok: true };
}
```

`src/components/delete-account-form.tsx` :

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { deleteAccountAction } from "@/server/account/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, {});

  useEffect(() => {
    if (!state.ok) return;
    // Le compte n'existe plus : on efface les cookies de session puis on quitte la page.
    authClient.signOut().finally(() => window.location.assign("/"));
  }, [state.ok]);

  if (state.ok) return <p className="rounded-lg bg-stone-100 p-3">Votre compte a été supprimé. Au revoir et merci !</p>;

  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <Label htmlFor="confirmation">Tapez SUPPRIMER pour confirmer</Label>
      <Input id="confirmation" name="confirmation" autoComplete="off" required />
      <FieldError errors={state.fieldErrors?.confirmation} />
      <Button type="submit" variant="danger" disabled={pending}>{pending ? "Suppression…" : "Supprimer définitivement mon compte"}</Button>
    </form>
  );
}
```

`src/app/compte/page.tsx` :

```tsx
import Link from "next/link";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { Card } from "@/components/ui";
import { requireProfile } from "@/server/session";

const ROLE_LABELS = { student: "Étudiant·e", host: "Hôte", admin: "Admin" } as const;

export default async function AccountPage() {
  const profile = await requireProfile();
  return (
    <main className="mx-auto max-w-md space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Mon compte</h1>
      <Card className="space-y-1">
        <p><strong>{profile.firstName}</strong> · {ROLE_LABELS[profile.role]}</p>
        {profile.school && <p className="text-sm text-stone-600">{profile.school}</p>}
      </Card>
      <Card className="space-y-3 border-red-200">
        <h2 className="text-lg font-semibold text-red-800">Supprimer mon compte</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>Vos repas et demandes à venir seront annulés, et les personnes concernées prévenues.</li>
          <li>Vos données de vérification et la photo de votre carte seront effacées.</li>
          <li>Vos messages et avis resteront lisibles, signés « Utilisateur supprimé ».</li>
          <li>Cette action est définitive.</li>
        </ul>
        <DeleteAccountForm />
      </Card>
      <p className="text-sm text-stone-500">
        En savoir plus : <Link href="/donnees-personnelles" className="underline">données personnelles</Link>.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test && npm run test:integration`
Expected: tout passe.

Manuel (`npm run dev`) :
1. Créer un compte `e2e+manuel@example.com` (étudiant).
2. « Mon compte » : taper « supprimer » en minuscules affiche le message d'erreur ; « SUPPRIMER » mène à « Votre compte a été supprimé », puis à l'accueil, déconnecté.
3. Une reconnexion avec le même email et le même mot de passe affiche « Email ou mot de passe incorrect ».
4. Avec `run_sql`, la pierre tombale existe (`first_name = 'Utilisateur supprimé'`) et aucun `neon_auth."user"` n'a cet email.

- [ ] **Step 8: Commit**

```bash
git add src drizzle tests
git commit -m "feat: suppression de compte avec anonymisation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Nettoyage des photos de carte

**Files:**
- Modify: `src/services/storage.ts` (`list`), `src/server/cron.ts`, `tests/integration/cron.test.ts`, `package.json`
- Create: `src/server/cleanup.ts`, `scripts/cleanup.ts`
- Test: `src/services/storage.test.ts`, `tests/integration/cleanup.test.ts`

**Interfaces:**
- Produces:
  - `CardStorage.list(prefix: string): Promise<string[]>` (implémentations S3 et mémoire)
  - `CARD_RETENTION_DAYS = 30`, `EXPIRED_CARD_REASON = "Demande expirée, merci de renvoyer votre carte"`
  - `cleanupStaleCards(db, storage, now?): Promise<{ expired: number; orphansDeleted: number }>`
  - `runDailyJob` renvoie aussi `cleanup: { expired, orphansDeleted }`
  - `npm run cleanup`

- [ ] **Step 1: `list` dans le stockage (test qui échoue)**

Dans `src/services/storage.test.ts`, ajouter dans le test de `createMemoryStorage` :

```ts
    await storage.put("cards/u2/b.jpg", new Uint8Array([1]), "image/jpeg");
    await storage.put("checks/x.txt", new Uint8Array([1]), "text/plain");
    expect(await storage.list("cards/")).toEqual(["cards/u2/b.jpg"]);
```

(avant la ligne `await storage.delete("cards/u1/a.jpg");`, puis adapter l'assertion finale à `expect(storage.objects.size).toBe(2);`).

Run: `npm test -- src/services/storage.test.ts`
Expected: FAIL.

Ajouter `list(prefix: string): Promise<string[]>;` à l'interface `CardStorage`. Dans `createMemoryStorage` :

```ts
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    },
```

Dans `createNeonStorage`, ajouter `ListObjectsV2Command` à l'import de `@aws-sdk/client-s3`, puis :

```ts
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
```

Run: `npm test -- src/services/storage.test.ts`
Expected: PASS.

- [ ] **Step 2: Test du nettoyage (échoue)**

`tests/integration/cleanup.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { profiles, verifications } from "@/db/schema";
import { EXPIRED_CARD_REASON, cleanupStaleCards } from "@/server/cleanup";
import { submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600_000;
const png = { type: "image/png", size: 10, bytes: new Uint8Array(10) };
const card = { school: "kedge", studentNumber: "12345678" };

beforeEach(resetDb);
afterAll(closeDb);

describe("cleanupStaleCards", () => {
  it("expire une demande de plus de 30 jours, garde une demande récente, supprime une photo orpheline", async () => {
    const storage = createMemoryStorage();
    const oldId = await makeAuthUser("old@gmail.com");
    const oldStudent = await makeProfile({ userId: oldId, verificationStatus: "none" });
    const recentId = await makeAuthUser("recent@gmail.com");
    const recentStudent = await makeProfile({ userId: recentId, verificationStatus: "none" });
    const old = await submitStudentCard(db, storage, oldStudent, card, png);
    await db.update(verifications).set({ createdAt: new Date(Date.now() - 31 * DAY) }).where(eq(verifications.id, old.id));
    const recent = await submitStudentCard(db, storage, recentStudent, card, png);
    await storage.put("cards/fantome/perdue.png", new Uint8Array([1]), "image/png");

    expect(await cleanupStaleCards(db, storage)).toEqual({ expired: 1, orphansDeleted: 1 });

    const [o] = await db.select().from(verifications).where(eq(verifications.id, old.id));
    expect(o).toMatchObject({ status: "rejected", rejectionReason: EXPIRED_CARD_REASON, cardObjectKey: null });
    const [op] = await db.select().from(profiles).where(eq(profiles.userId, oldStudent.userId));
    expect(op.verificationStatus).toBe("rejected");
    const [r] = await db.select().from(verifications).where(eq(verifications.id, recent.id));
    expect(r.status).toBe("pending");
    expect(await storage.list("cards/")).toEqual([r.cardObjectKey]);
    expect(await cleanupStaleCards(db, storage)).toEqual({ expired: 0, orphansDeleted: 0 });
  });
});
```

Run: `npm run test:integration -- tests/integration/cleanup.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/server/cleanup.ts` :

```ts
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profiles, verifications } from "@/db/schema";
import type { CardStorage } from "@/services/storage";
import { queueNotifications } from "@/server/notifications/service";

export const CARD_RETENTION_DAYS = 30;
export const EXPIRED_CARD_REASON = "Demande expirée, merci de renvoyer votre carte";

// Spec §9 : aucune photo de carte ne reste plus de 30 jours, même sans décision.
export async function cleanupStaleCards(db: Db, storage: CardStorage, now = new Date()): Promise<{ expired: number; orphansDeleted: number }> {
  const limit = new Date(now.getTime() - CARD_RETENTION_DAYS * 24 * 3600_000);
  const expiredKeys = await db.transaction(async (tx) => {
    const stale = await tx
      .update(verifications)
      .set({ status: "rejected", rejectionReason: EXPIRED_CARD_REASON, cardObjectKey: null, reviewedAt: now })
      .where(and(eq(verifications.method, "card"), eq(verifications.status, "pending"), lt(verifications.createdAt, limit)))
      .returning({ userId: verifications.userId, key: verifications.cardObjectKey });
    if (stale.length > 0) {
      const userIds = stale.map((s) => s.userId);
      await tx.update(profiles).set({ verificationStatus: "rejected" }).where(and(inArray(profiles.userId, userIds), eq(profiles.verificationStatus, "pending")));
      await queueNotifications(
        tx,
        userIds.map((userId) => ({
          userId,
          type: "verification_rejected" as const,
          title: "Vérification expirée",
          body: `${EXPIRED_CARD_REASON}.`,
          link: "/etudiant/verification",
        })),
      );
    }
    return stale.map((s) => s.key).filter((k): k is string => Boolean(k));
  });
  for (const key of expiredKeys) await storage.delete(key).catch((e) => console.warn("[cleanup] photo non supprimée", key, e));

  // Photos orphelines (suppression ratée après une décision, envoi interrompu…).
  const referenced = new Set(
    (await db.select({ key: verifications.cardObjectKey }).from(verifications).where(isNotNull(verifications.cardObjectKey))).map((r) => r.key!),
  );
  let orphansDeleted = 0;
  for (const key of await storage.list("cards/")) {
    if (referenced.has(key)) continue;
    await storage.delete(key);
    orphansDeleted += 1;
  }
  return { expired: expiredKeys.length, orphansDeleted };
}
```

Le test « expire une demande » attend aussi une notification « Vérification expirée » : ajouter dans le test, après le premier `expect(await cleanupStaleCards…)`, la vérification que `notifications` contient une ligne `verification_rejected` pour `oldStudent` (avec `notifications` dans l'import du schéma).

Dans `src/server/cron.ts`, `runDailyJob(db, sender, { appUrl, now, storage })` prend un `storage?: CardStorage` optionnel. S'il est fourni, il appelle `cleanupStaleCards(db, storage, now)` avant l'envoi des emails et ajoute `cleanup` au résultat ; sinon `cleanup` vaut `{ expired: 0, orphansDeleted: 0 }`. La route `/api/cron/daily` passe `getCardStorage()`. Mettre à jour l'assertion de `tests/integration/cron.test.ts` : `expect(result).toEqual({ reminders: 2, emails: { sent: 2, failed: 0, skipped: 0 }, cleanup: { expired: 0, orphansDeleted: 0 } });`.

`scripts/cleanup.ts` :

```ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createDb } from "../src/db/client";
import { cleanupStaleCards } from "../src/server/cleanup";
import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

const db = createDb(process.env.DATABASE_URL!);
cleanupStaleCards(db, createNeonStorage(storageConfigFromEnv()))
  .then((r) => console.log(`Nettoyage : ${r.expired} demande(s) expirée(s), ${r.orphansDeleted} photo(s) orpheline(s) supprimée(s).`))
  .finally(() => db.$client.end());
```

Ajouter le script `"cleanup": "tsx scripts/cleanup.ts"` dans `package.json`.

- [ ] **Step 4: Lancer**

Run: `npx tsc --noEmit && npm test && npm run test:integration && npm run cleanup`
Expected: PASS ; `npm run cleanup` affiche `Nettoyage : 0 demande(s) expirée(s), 0 photo(s) orpheline(s) supprimée(s).` sur la branche `demo`, où la carte de Thomas est récente et référencée.

- [ ] **Step 5: Commit**

```bash
git add src scripts/cleanup.ts package.json tests
git commit -m "feat: nettoyage des photos de carte (30 jours, orphelines)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Correctifs reportés

**Files:**
- Modify: `src/server/notifications/service.ts` (clé des rappels), `src/server/reports/service.ts` (notifications aux hôtes, code `ALREADY_HANDLED`), `src/domain/errors.ts`, `src/server/notifications/delivery.ts` (rappel d'une réservation non acceptée, `appUrl`), `src/components/thread-view.tsx`, `src/components/auth-forms.tsx`, `next.config.ts`
- Test: `tests/integration/notifications.test.ts`, `tests/integration/notifications-events.test.ts`, `tests/integration/reports.test.ts`, `tests/integration/email-delivery.test.ts`, `src/server/notifications/app-url.test.ts`

**Interfaces:**
- Produces:
  - Clé des rappels : `reminder:<bookingId>:<userId>:<startsAt ISO>`
  - Code d'erreur `ALREADY_HANDLED` (« Ce signalement a déjà été traité. »), utilisé par `resolveReport`
  - `appUrl(env?): string` : `APP_URL`, sinon `https://${VERCEL_URL}`, sinon `http://localhost:3000`

- [ ] **Step 1: Tests (échouent)**

1. Dans `tests/integration/notifications.test.ts` (avec `meals` dans l'import du schéma et `eq` de `drizzle-orm`) :

```ts
  it("renvoie un rappel si la date du repas change après un premier rappel", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile();
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 5 * HOUR) });
    await makeBooking(meal.id, s.userId, "accepted");
    expect(await ensureReminders(db, { userId: s.userId })).toBe(1);
    const nextWeek = new Date(Date.now() + 7 * 24 * HOUR);
    await db.update(meals).set({ startsAt: nextWeek }).where(eq(meals.id, meal.id));
    expect(await ensureReminders(db, { userId: s.userId, now: new Date(nextWeek.getTime() - 5 * HOUR) })).toBe(1);
  });
```

2. Dans `tests/integration/notifications-events.test.ts` :

```ts
  it("prévient l'hôte, avec le titre du repas, pour chaque demande annulée par la suspension d'un étudiant", async () => {
    const admin = await makeProfile({ role: "admin" });
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const m1 = await makeMeal(host.userId, { title: "Couscous" });
    const m2 = await makeMeal(host.userId, { title: "Tajine" });
    const b1 = await makeBooking(m1.id, student.userId, "accepted");
    await makeBooking(m2.id, student.userId, "pending");
    const { id } = await createReport(db, host, b1.id, { reason: "Comportement inacceptable" });
    await resolveReport(db, admin, id, "suspend");
    const bodies = (await inbox(host.userId)).map((n) => n.body).sort();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("Couscous");
    expect(bodies[1]).toContain("Tajine");
  });
```

3. Dans `tests/integration/reports.test.ts`, dans le test du double traitement, remplacer `{ code: "INVALID_TRANSITION" }` par `{ code: "ALREADY_HANDLED" }`.

4. Dans `tests/integration/email-delivery.test.ts` (avec `makeBooking`, `makeMeal` dans l'import des helpers et `bookings` dans celui du schéma) :

```ts
  it("n'envoie pas un rappel dont la réservation n'est plus acceptée", async () => {
    const userId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    await makeProfile({ userId });
    const host = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, userId, "accepted");
    await queueNotifications(db, [{ userId, type: "reminder", title: "Rappel", body: "Demain", link: "/", dedupeKey: `reminder:${booking.id}:${userId}:${meal.startsAt.toISOString()}` }]);
    await db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
    const sender = recordingSender();
    expect(await deliverPendingEmails(db, sender, { appUrl: "https://x" })).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sender.sent).toHaveLength(0);
  });
```

5. `src/server/notifications/app-url.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { appUrl } from "./delivery";

describe("appUrl", () => {
  it("préfère APP_URL, puis l'URL Vercel, puis localhost", () => {
    expect(appUrl({ APP_URL: "https://ocleans-demo.vercel.app" })).toBe("https://ocleans-demo.vercel.app");
    expect(appUrl({ VERCEL_URL: "ocleans-abc.vercel.app" })).toBe("https://ocleans-abc.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});
```

Run: `npm test -- src/server/notifications/app-url.test.ts && npm run test:integration`
Expected: FAIL sur ces cinq points.

- [ ] **Step 2: Implémenter**

1. Dans `ensureReminders`, ajouter `startsAt` à la clé : `dedupeKey: \`reminder:${r.bookingId}:${r.studentId}:${r.startsAt.toISOString()}\`` (et de même pour l'hôte).
2. Dans `src/domain/errors.ts`, ajouter `| "ALREADY_HANDLED"` et `ALREADY_HANDLED: "Ce signalement a déjà été traité.",`. Dans `resolveReport`, `if (report.status !== "open") throw new DomainError("ALREADY_HANDLED");`.
3. Dans `suspendUser`, la notification aux hôtes devient une par demande, avec le titre :

```ts
  if (studentBookings.length > 0) {
    const titles = await tx
      .select({ id: meals.id, hostId: meals.hostId, title: meals.title })
      .from(meals)
      .where(inArray(meals.id, studentBookings.map((b) => b.mealId)));
    const byId = new Map(titles.map((m) => [m.id, m]));
    await queueNotifications(
      tx,
      studentBookings.map((b) => ({
        userId: byId.get(b.mealId)!.hostId,
        type: "cancelled_by_team" as const,
        title: "Une demande a été annulée",
        body: `Une demande pour « ${byId.get(b.mealId)!.title} » a été annulée par l'équipe Ocleans.`,
        link: "/hote/offres",
      })),
    );
  }
```

4. Dans `deliverPendingEmails`, inclure `type` et `dedupeKey` dans la sélection. Dans la boucle, avant l'envoi : si `n.type === "reminder"` et qu'une clé est présente, lire `bookingId = n.dedupeKey.split(":")[1]`, et si la réservation n'est plus `accepted`, marquer `skipped` et passer à la suite (`result.skipped += 1`).
5. `appUrl` devient :

```ts
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}
```

6. Dans `src/components/thread-view.tsx`, n'afficher « Pas encore de message. Présentez-vous ! » que si `canWrite` ; sinon, pour une liste vide, afficher « Aucun message. ».
7. Dans `src/components/auth-forms.tsx`, dans `useAuthSubmit`, en cas d'erreur, appeler `router.refresh()` avant `return`, pour que l'en-tête reflète la déconnexion préalable.
8. Dans `next.config.ts`, `bodySizeLimit: "4.2mb"`, et mettre à jour le commentaire (4,2 Mio ≈ 4,4 Mo, sous les 4,5 Mo de Vercel).

- [ ] **Step 3: Lancer**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run test:integration && npm run build`
Expected: tout passe.

- [ ] **Step 4: Commit**

```bash
git add src tests next.config.ts
git commit -m "fix: correctifs reportés (rappels après changement de date, notifications de suspension, signalement déjà traité, liens des emails…)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mise en place des tests de bout en bout

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/fixtures/carte.png`, `scripts/e2e-cleanup.ts`, `src/server/e2e-accounts.ts`
- Modify: `package.json`, `.gitignore`, `vitest.config.ts`
- Test: `src/server/e2e-accounts.test.ts`

**Interfaces:**
- Produces:
  - `isE2eEmail(email: string): boolean`, qui n'accepte que `^e2e\+[a-z0-9-]+@example\.com$`
  - `npm run test:e2e` (lance le serveur de dev, puis le nettoyage)
  - Helpers : `newActor(browser)`, `uniqueEmail(tag)`, `signUp(page, { firstName, email, role, school? })`, `quickLogin(page, label)`, `E2E_PASSWORD`

- [ ] **Step 1: Garde-fou du nettoyage (test qui échoue)**

`src/server/e2e-accounts.test.ts` :

```ts
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
```

Run: `npm test -- src/server/e2e-accounts.test.ts`
Expected: FAIL.

`src/server/e2e-accounts.ts` :

```ts
// Seules ces adresses peuvent être supprimées par le nettoyage des tests de bout en bout.
const E2E_EMAIL = /^e2e\+[a-z0-9-]+@example\.com$/;

export function isE2eEmail(email: string): boolean {
  return E2E_EMAIL.test(email);
}
```

Run: `npm test -- src/server/e2e-accounts.test.ts`
Expected: PASS.

- [ ] **Step 2: Nettoyage des comptes e2e**

`scripts/e2e-cleanup.ts` :

```ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { isE2eEmail } from "../src/server/e2e-accounts";
import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const storage = createNeonStorage(storageConfigFromEnv());
  const users = (await db.execute(sql`select id::text as id, email from neon_auth."user" where email like 'e2e+%@example.com'`)).rows as { id: string; email: string }[];
  const targets = users.filter((u) => isE2eEmail(u.email));
  for (const u of targets) {
    const cards = (await db.execute(sql`select card_object_key from verifications where user_id = ${u.id} and card_object_key is not null`)).rows as { card_object_key: string }[];
    for (const c of cards) await storage.delete(c.card_object_key).catch(() => undefined);
    // La suppression du profil efface en cascade repas, demandes, messages, avis, signalements et notifications.
    await db.execute(sql`delete from profiles where user_id = ${u.id}`);
    await db.execute(sql`delete from neon_auth."user" where id::text = ${u.id}`);
  }
  // Les pierres tombales du scénario de suppression de compte restent : elles sont déjà anonymes, et rien ne permet
  // de les distinguer sans risque de celles de vrais utilisateurs.
  console.log(`Nettoyage e2e : ${targets.length} compte(s) supprimé(s).`);
  await db.$client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Le nettoyage ne supprime que des comptes dont l'email passe `isE2eEmail`. Les profils anonymisés du scénario de suppression de compte sont laissés en place : ils ne contiennent plus aucune donnée personnelle.

- [ ] **Step 3: Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

`playwright.config.ts` :

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", ...devices["Pixel 7"], trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
```

Dans `package.json` : `"test:e2e": "playwright test; status=$?; tsx scripts/e2e-cleanup.ts; exit $status"`.

Dans `.gitignore` : `test-results/` et `playwright-report/`.

Dans `vitest.config.ts` : l'`include` reste `src/**/*.test.ts`, ce qui exclut déjà `tests/e2e`. Rien à changer, sauf si le fichier a évolué.

`tests/e2e/fixtures/carte.png` : générer un PNG 1×1 avec `node -e 'require("fs").writeFileSync("tests/e2e/fixtures/carte.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64"))'`.

`tests/e2e/helpers.ts` :

```ts
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
```

- [ ] **Step 4: Vérifier l'outillage**

Run: `npm test && npx tsc --noEmit && npx tsx scripts/e2e-cleanup.ts`
Expected: PASS ; le script affiche `Nettoyage e2e : 0 compte(s) supprimé(s).`

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e scripts/e2e-cleanup.ts src/server/e2e-accounts.ts src/server/e2e-accounts.test.ts package.json package-lock.json .gitignore
git commit -m "test: outillage des tests de bout en bout (Playwright, nettoyage des comptes e2e)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scénarios de bout en bout

**Files:**
- Create: `tests/e2e/parcours-complet.spec.ts`, `tests/e2e/annulation-notifications.spec.ts`, `tests/e2e/suppression-compte.spec.ts`, `tests/e2e/acces.spec.ts`

**Interfaces:**
- Consumes: les helpers de la Task 6 et le compte admin de démo (`/Admin Ocleans/`).

- [ ] **Step 1: Parcours complet**

`tests/e2e/parcours-complet.spec.ts` :

```ts
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
```

- [ ] **Step 2: Annulation et notifications**

`tests/e2e/annulation-notifications.spec.ts` :

```ts
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

  const student = await newActor(browser);
  await signUp(student, { firstName: "Camille", email: uniqueEmail("camille"), role: "student", school: "Bordeaux INP" });
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
```

- [ ] **Step 3: Suppression de compte**

`tests/e2e/suppression-compte.spec.ts` :

```ts
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
```

- [ ] **Step 4: Accès et pages publiques**

`tests/e2e/acces.spec.ts` :

```ts
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
```

- [ ] **Step 5: Lancer**

Run: `npm run test:e2e`
Expected: 4 scénarios `passed`, puis `Nettoyage e2e : N compte(s) supprimé(s).` (N = 4 : le compte du scénario de suppression n'existe déjà plus). Avec `run_sql` sur `demo` : `select count(*) from neon_auth."user" where email like 'e2e+%'` renvoie `0`, et les comptes de démo sont intacts (`select count(*) from profiles where first_name in ('Léa','Mireille')` renvoie `2`).

En cas d'échec d'un sélecteur, corriger le **test** pour qu'il suive l'interface réelle (libellés exacts), jamais l'application pour coller au test. La seule exception est une vraie erreur de l'application, qui donne alors lieu à un correctif avec un test d'intégration qui échoue d'abord.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e
git commit -m "test: scénarios de bout en bout (parcours complet, annulation, suppression de compte, accès)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Déploiement et recette finale

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Ajouter :

````markdown
## Sécurité et données personnelles

- **Limites anti-abus** : 10 demandes par 24 h, 30 messages par minute, 5 signalements par 24 h, 3 envois de carte par 24 h.
- **Données personnelles** : `/donnees-personnelles`. Le bouton « Supprimer mon compte », sur `/compte`, anonymise le profil (les messages et avis restent signés « Utilisateur supprimé »), efface la vérification et la photo, annule les repas et demandes à venir, puis supprime le compte Neon Auth.
- **Nettoyage** : les photos en attente depuis plus de 30 jours et les photos orphelines sont supprimées chaque jour par le cron (Production), ou à la main avec `npm run cleanup`.

## Tests de bout en bout

```bash
npx playwright install chromium   # une fois
npm run test:e2e                  # lance le serveur de dev sur la branche demo, puis supprime les comptes e2e+…@example.com
```
````

- [ ] **Step 2: Déployer**

```bash
vercel deploy --target preview --yes < /dev/null
vercel alias set <url> ocleans-demo.vercel.app < /dev/null
```

- [ ] **Step 3: Recette en ligne (Playwright MCP, 390×844)**

1. `/donnees-personnelles` : la page s'affiche sans débordement, avec le lien dans le pied de page.
2. Inscription `e2e+recette-<horodatage>@example.com`, puis « Mon compte » → suppression avec `SUPPRIMER` : retour à l'accueil, et la reconnexion échoue.
3. `/repas` et `/repas?vue=carte` s'affichent normalement, et le cron répond 401 sans secret.
4. `npx tsx scripts/e2e-cleanup.ts` puis `npm run seed:demo`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: sécurité, données personnelles et tests de bout en bout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
