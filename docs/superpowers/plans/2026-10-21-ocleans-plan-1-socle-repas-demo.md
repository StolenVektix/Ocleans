# Ocleans — Plan 1 : socle, repas, réservations et démo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une app web mobile-first en ligne où un hôte publie un repas, un étudiant vérifié en fait la demande, l'hôte accepte ou refuse, et l'adresse n'est révélée qu'après acceptation — avec des comptes et données de démo bordelaises.

**Architecture:** Un seul projet Next.js 16 (App Router, Node.js) déployé sur Vercel. Les règles métier sont des fonctions pures dans `src/domain/`. Les services `src/server/*/service.ts` prennent `(db, actor, input)` et sont testés contre une branche Neon dédiée. Les Server Actions (`actions.ts`) ne font que récupérer la session, appeler le service et rafraîchir les pages. L'auth est Neon Auth (Managed Better Auth) ; la base est Neon Postgres via Drizzle.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Neon Postgres + `@neondatabase/serverless`, Drizzle ORM + drizzle-kit, Neon Auth (`@neondatabase/auth`), Zod 4, Vitest, tsx, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md`

**Série de plans :**
1. **Ce plan** — socle, repas, réservations, régimes (option A), mode démo, déploiement Preview. *(spec §12 étapes 1–2, plus l'option A, avancée ici car elle touche le même formulaire et les mêmes filtres)*
2. Vérification étudiante : email universitaire, carte, écran admin.
3. Options F, B, C, D, E : annulation, emails et rappels, carte, messagerie, avis et signalements.
4. Sécurité et RGPD (limites anti-abus, page données, suppression de compte, nettoyage planifié) et tests de bout en bout Playwright.

**Décisions propres à ce plan :**
- Les primitives d'UI sont de petits composants Tailwind maison (`src/components/ui.tsx`) au lieu de shadcn/ui : rien à générer, API stable. shadcn pourra être ajouté plus tard.
- Un repas propose de 1 à 6 places.
- Tant que le Plan 2 n'est pas livré, seuls les étudiants marqués `verified` en base (les comptes de démo) peuvent envoyer une demande.
- L'identifiant utilisateur est du `text` (id Neon Auth), pas un `uuid`.

## Global Constraints

- Node.js ≥ 22 en local (WebSocket global requis par `@neondatabase/serverless`) ; Node.js 24 sur Vercel. Runtime Node.js uniquement, jamais `export const runtime = 'edge'`.
- Next.js 16 : `params` et `searchParams` sont des `Promise` ; la protection des routes passe par `src/proxy.ts`.
- Toute l'interface est en **français**.
- Ville : Bordeaux et sa métropole ; quartiers issus de la liste fermée `src/config/neighborhoods.ts`.
- Dates saisies et affichées dans le fuseau **Europe/Paris**, stockées en `timestamptz`.
- **L'adresse exacte (`meals.address`) n'est jamais renvoyée au client**, sauf à l'hôte du repas et à un étudiant dont la réservation est `accepted` (spec, règle 7).
- Un étudiant n'envoie qu'**une demande par repas** ; le nombre de réservations `accepted` ne dépasse jamais `seats_total` (contrôle en transaction avec verrou sur le repas).
- Drizzle : uniquement le query builder SQL (`select`/`insert`/`update`/`delete`/`execute`), jamais `db.query.*`.
- Région Neon : AWS `aws-eu-central-1` (obligatoire pour Neon Auth, données en UE).
- Aucun secret committé : `.env.local` est ignoré par git ; `.env.example` ne contient que les noms.
- Pas de paiement.
- Chaque message de commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Heure de Paris sur un serveur en UTC** : un repas saisi « 19:30 » doit s'afficher « 19:30 » partout, été comme hiver, alors que Vercel tourne en UTC. Test ajouté en Task 3 (`formatMealDate` sur une date d'été et une date d'hiver).
2. **Double-clic sur « Envoyer la demande »** : deux requêtes simultanées du même étudiant doivent donner une demande et un message « Vous avez déjà fait une demande pour ce repas », pas une erreur SQL brute. Test ajouté en Task 8.
3. **URL forgée** (`/repas/abc`, `?quartier=Paris&regime=pizza&jour=demain`) : page 404 ou filtres ignorés, jamais de crash Postgres sur un uuid invalide. Tests ajoutés en Task 7.
4. **Hôte suspendu** : ses repas ne doivent plus apparaître dans la liste publique ni en fiche. Test ajouté en Task 7.
5. **Connecté sans profil** (inscription interrompue avant le choix du rôle) : toute page protégée renvoie vers `/bienvenue` au lieu de planter. Vérifié à la main en Task 6, étape 8.

---

## Structure des fichiers

```
src/
  config/neighborhoods.ts      quartiers de Bordeaux et de la métropole (liste fermée)
  config/diet-tags.ts          étiquettes de régime et libellés
  domain/types.ts              enums partagés (rôles, statuts)
  domain/dates.ts              conversions heure de Paris <-> Date, formatage
  domain/errors.ts             DomainError + messages français
  domain/ids.ts                isUuid
  domain/meal-input.ts         schéma Zod de saisie d'un repas
  domain/bookings.ts           règles métier : droits, places, transitions, visibilité de l'adresse
  db/schema.ts                 tables Drizzle
  db/client.ts                 createDb / getDb
  lib/auth/server.ts           instance Neon Auth côté serveur
  lib/auth/client.ts           client Neon Auth côté navigateur
  lib/demo.ts                  comptes de démo, isDemoMode
  server/session.ts            getSessionUser, getCurrentProfile, requireProfile, homeFor
  server/form-state.ts         FormState, formValues, toFormState
  server/profiles/service.ts   createProfile
  server/profiles/actions.ts   createProfileAction
  server/meals/service.ts      createMeal, updateMeal, listUpcomingMeals, getMealForViewer, listHostMeals, getHostMeal
  server/meals/actions.ts      createMealAction, updateMealAction
  server/bookings/service.ts   requestBooking, decideBooking, listStudentBookings
  server/bookings/actions.ts   requestBookingAction, decideBookingAction
  components/ui.tsx            Button, LinkButton, Input, Textarea, Select, Label, Card, Badge
  components/…                 composants d'écran
  app/…                        pages
  proxy.ts                     protection des routes
scripts/seed-demo.ts           données de démo
tests/integration/…            tests contre la branche Neon « test »
```

---

### Task 1: Initialisation du projet Next.js et de l'outillage

**Files:**
- Create: projet Next.js à la racine du dépôt (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, …)
- Create: `vitest.config.ts`, `vitest.integration.config.ts`, `.env.example`
- Modify: `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `lint`, `test`, `test:integration`, `db:generate`, `db:migrate`, `db:migrate:test`, `seed:demo` ; alias d'import `@/*` → `src/*`.

- [ ] **Step 1: Vérifier Node**

Run: `node -v`
Expected: `v22.x` ou plus récent. Sinon, s'arrêter et demander à l'utilisateur d'installer Node 24 (par exemple via nvm).

- [ ] **Step 2: Générer le projet dans un dossier temporaire puis le déplacer à la racine**

Le dépôt contient déjà `docs/`, donc on génère à côté puis on copie.

```bash
cd /home/cleme_stolenvektix1/claudecodeformation/Ocleans
npx create-next-app@latest .scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cp -a .scaffold/. ./
rm -rf .scaffold
```

Expected: `package.json`, `src/app/page.tsx` et `node_modules/` sont à la racine.

- [ ] **Step 3: Installer les dépendances**

```bash
npm install drizzle-orm @neondatabase/serverless @neondatabase/auth zod server-only
npm install -D drizzle-kit vitest tsx dotenv
```

Si `npm ls drizzle-orm` affiche une version majeure ≥ 1, consulter la doc Drizzle de cette version pour `drizzle({ client })` et `.for("update")` avant la Task 5.

- [ ] **Step 4: Ajouter les scripts dans `package.json`**

Dans `"scripts"`, garder `dev`, `build`, `start`, `lint` et ajouter :

```json
"test": "vitest run",
"test:integration": "vitest run --config vitest.integration.config.ts",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:migrate:test": "DB_TARGET=test drizzle-kit migrate",
"seed:demo": "tsx scripts/seed-demo.ts"
```

- [ ] **Step 5: Configurer Vitest**

`vitest.config.ts` :

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

`vitest.integration.config.ts` :

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

- [ ] **Step 6: Variables d'environnement et `.gitignore`**

`.env.example` :

```bash
# Branche Neon "demo" (chaîne poolée)
DATABASE_URL=
# Branche Neon "test" (tests d'intégration uniquement)
DATABASE_URL_TEST=
# Neon Auth de la branche "demo"
NEON_AUTH_BASE_URL=
# openssl rand -base64 32
NEON_AUTH_COOKIE_SECRET=
# "true" pour la démo
DEMO_MODE=true
# Mot de passe commun des comptes de démo (12 caractères minimum)
DEMO_PASSWORD=
```

Le `.gitignore` généré contient `.env*`. Ajouter juste en dessous :

```
!.env.example
```

- [ ] **Step 7: Nettoyer le gabarit**

`src/app/globals.css` (remplacer tout le contenu) :

```css
@import "tailwindcss";

body {
  @apply bg-stone-50 text-stone-900 antialiased;
}
```

`src/app/layout.tsx` (remplacer tout le contenu) :

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ocleans — Repas partagés entre habitants et étudiants",
  description: "Partagez un repas avec un étudiant à Bordeaux.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (remplacer tout le contenu, la vraie page d'accueil arrive en Task 11) :

```tsx
export default function HomePage() {
  return <main className="p-4 text-2xl font-bold">Ocleans</main>;
}
```

Supprimer les fichiers du gabarit devenus inutiles : `rm -f public/*.svg`.

- [ ] **Step 8: Vérifier**

Run: `npm run lint && npm run build && npm test -- --passWithNoTests`
Expected: les trois commandes réussissent.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: initialise le projet Next.js et l'outillage de test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Infrastructure Neon (projet, branches, auth) et variables locales

**Files:**
- Create: `.env.local` (non committé)

**Interfaces:**
- Produces: les variables `DATABASE_URL`, `DATABASE_URL_TEST`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DEMO_MODE`, `DEMO_PASSWORD` dans `.env.local`.

Toutes les étapes passent par les outils MCP Neon (plugin connecté). Charger les schémas avec ToolSearch (`select:mcp__plugin_neon_neon__…`) avant l'appel.

- [ ] **Step 1: Créer le projet**

1. `list_organizations` : si plusieurs organisations, demander à l'utilisateur laquelle utiliser.
2. `create_project` avec `name: "ocleans"`, `region_id: "aws-eu-central-1"` et l'organisation choisie.
3. Noter `project_id` et l'id de la branche par défaut (`main`).

- [ ] **Step 2: Créer les branches `demo` et `test`**

`create_branch` deux fois depuis `main` : `branch_name: "demo"` puis `branch_name: "test"`. Noter les deux `branch_id`.

- [ ] **Step 3: Activer Neon Auth sur `demo`**

1. `provision_neon_auth` avec `project_id` et le `branch_id` de `demo`.
2. Lire la configuration (`get_neon_auth_config` ou `get_auth`) pour obtenir l'URL Auth de la branche, c'est-à-dire `NEON_AUTH_BASE_URL`.
3. Vérifier dans cette configuration que la vérification de l'email à l'inscription est **désactivée** pour `demo`. Si elle est active, la désactiver avec `update_auth_config`. Les comptes de démo ont des emails `@example.com` qui ne reçoivent rien.

- [ ] **Step 4: Récupérer les chaînes de connexion**

`get_connection_string` pour `demo` puis pour `test`, avec la chaîne **poolée**.

- [ ] **Step 5: Écrire `.env.local`**

```bash
cd /home/cleme_stolenvektix1/claudecodeformation/Ocleans
cat > .env.local <<EOF
DATABASE_URL=<chaîne poolée de demo>
DATABASE_URL_TEST=<chaîne poolée de test>
NEON_AUTH_BASE_URL=<URL Auth de demo>
NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)
DEMO_MODE=true
DEMO_PASSWORD=$(openssl rand -base64 18)
EOF
```

Remplacer les trois valeurs entre chevrons par celles des étapes 3 et 4. Ne jamais afficher ce fichier dans le terminal.

- [ ] **Step 6: Vérifier**

1. `run_sql` avec `select 1` sur `demo` puis sur `test` : les deux répondent.
2. `git status --short` : `.env.local` n'apparaît pas.

Rien à committer dans cette tâche.

---

### Task 3: Configuration bordelaise et dates en heure de Paris

**Files:**
- Create: `src/config/neighborhoods.ts`, `src/config/diet-tags.ts`, `src/domain/dates.ts`
- Test: `src/domain/dates.test.ts`

**Interfaces:**
- Produces:
  - `NEIGHBORHOODS: readonly string[]` (tuple `as const`), `type Neighborhood`, `isNeighborhood(v: string): v is Neighborhood`
  - `DIET_TAGS: Record<DietTag, string>`, `type DietTag`, `DIET_TAG_KEYS: [DietTag, ...DietTag[]]`, `isDietTag(v: string): v is DietTag`
  - `parisLocalToDate(local: string): Date` (format `YYYY-MM-DDTHH:mm`, lève une `Error` si invalide)
  - `dateToParisLocal(date: Date): string` (format `YYYY-MM-DDTHH:mm`)
  - `formatMealDate(date: Date): string` (ex. « mardi 14 juillet à 19:30 »)
  - `isDayString(v: string): boolean` (format `YYYY-MM-DD`), `nextDay(day: string): string`

- [ ] **Step 1: Écrire la configuration**

`src/config/neighborhoods.ts` :

```ts
export const NEIGHBORHOODS = [
  "Bacalan",
  "Chartrons",
  "Grand Parc",
  "Saint-Seurin",
  "Caudéran",
  "Saint-Pierre",
  "Saint-Michel",
  "Victoire",
  "Capucins",
  "Nansouty",
  "Saint-Augustin",
  "Bastide",
  "Talence",
  "Pessac",
  "Mérignac",
  "Bègles",
  "Le Bouscat",
  "Gradignan",
  "Cenon",
  "Floirac",
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

export function isNeighborhood(value: string): value is Neighborhood {
  return (NEIGHBORHOODS as readonly string[]).includes(value);
}
```

`src/config/diet-tags.ts` :

```ts
export const DIET_TAGS = {
  vegetarien: "Végétarien",
  vegan: "Végan",
  halal: "Halal",
  casher: "Casher",
  sans_gluten: "Sans gluten",
  sans_lactose: "Sans lactose",
  sans_porc: "Sans porc",
} as const;

export type DietTag = keyof typeof DIET_TAGS;

export const DIET_TAG_KEYS = Object.keys(DIET_TAGS) as [DietTag, ...DietTag[]];

export function isDietTag(value: string): value is DietTag {
  return value in DIET_TAGS;
}
```

- [ ] **Step 2: Écrire le test des dates (échoue)**

`src/domain/dates.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  dateToParisLocal,
  formatMealDate,
  isDayString,
  nextDay,
  parisLocalToDate,
} from "./dates";

describe("parisLocalToDate", () => {
  it("convertit une heure d'été (UTC+2)", () => {
    expect(parisLocalToDate("2026-07-14T19:30").toISOString()).toBe("2026-07-14T17:30:00.000Z");
  });

  it("convertit une heure d'hiver (UTC+1)", () => {
    expect(parisLocalToDate("2026-12-24T19:30").toISOString()).toBe("2026-12-24T18:30:00.000Z");
  });

  it("refuse un format invalide", () => {
    expect(() => parisLocalToDate("pas une date")).toThrow();
    expect(() => parisLocalToDate("2026-13-40T25:00")).toThrow();
  });
});

describe("dateToParisLocal", () => {
  it("fait l'aller-retour", () => {
    expect(dateToParisLocal(new Date("2026-07-14T17:30:00Z"))).toBe("2026-07-14T19:30");
    expect(dateToParisLocal(new Date("2026-12-24T18:30:00Z"))).toBe("2026-12-24T19:30");
  });
});

describe("formatMealDate", () => {
  it("affiche l'heure de Paris en été comme en hiver", () => {
    const summer = formatMealDate(new Date("2026-07-14T17:30:00Z"));
    expect(summer).toContain("mardi");
    expect(summer).toContain("juillet");
    expect(summer).toContain("19:30");
    expect(formatMealDate(new Date("2026-12-24T18:30:00Z"))).toContain("19:30");
  });
});

describe("jours", () => {
  it("valide et incrémente un jour", () => {
    expect(isDayString("2026-10-31")).toBe(true);
    expect(isDayString("demain")).toBe(false);
    expect(isDayString("2026-02-31")).toBe(false);
    expect(nextDay("2026-10-31")).toBe("2026-11-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
```

- [ ] **Step 3: Lancer le test**

Run: `npm test -- src/domain/dates.test.ts`
Expected: FAIL (module `./dates` introuvable).

- [ ] **Step 4: Implémenter**

`src/domain/dates.ts` :

```ts
const PARIS = "Europe/Paris";
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function parisParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function parisOffsetMinutes(date: Date): number {
  const p = parisParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

export function parisLocalToDate(local: string): Date {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Date locale invalide : ${local}`);
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error(`Date locale invalide : ${local}`);
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(utcGuess);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) {
    throw new Error(`Date locale invalide : ${local}`);
  }
  const offset = parisOffsetMinutes(new Date(utcGuess));
  let result = utcGuess - offset * 60_000;
  const offsetAtResult = parisOffsetMinutes(new Date(result));
  if (offsetAtResult !== offset) result = utcGuess - offsetAtResult * 60_000;
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateToParisLocal(date: Date): string {
  const p = parisParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const displayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMealDate(date: Date): string {
  return displayFormatter.format(date);
}

export function isDayString(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [year, month, day] = m.slice(1).map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function nextDay(day: string): string {
  const [year, month, d] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, d + 1)).toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Lancer le test**

Run: `npm test -- src/domain/dates.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/config src/domain/dates.ts src/domain/dates.test.ts
git commit -m "feat: quartiers de Bordeaux, régimes et dates en heure de Paris

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Règles métier (erreurs, saisie d'un repas, réservations)

**Files:**
- Create: `src/domain/types.ts`, `src/domain/errors.ts`, `src/domain/ids.ts`, `src/domain/meal-input.ts`, `src/domain/bookings.ts`
- Test: `src/domain/meal-input.test.ts`, `src/domain/bookings.test.ts`

**Interfaces:**
- Consumes: `NEIGHBORHOODS`, `DIET_TAG_KEYS`, `DietTag` (Task 3) ; `parisLocalToDate` (Task 3).
- Produces:
  - `ROLES`, `VERIFICATION_STATUSES`, `MEAL_STATUSES`, `BOOKING_STATUSES` (tuples `as const`) et les types `Role`, `VerificationStatus`, `MealStatus`, `BookingStatus`
  - `type DomainErrorCode`, `class DomainError extends Error { code: DomainErrorCode }`
  - `isUuid(value: string): boolean`
  - `mealInputSchema(now: Date)` : schéma Zod dont la sortie est `MealInput = { title; description; startsAt: Date; neighborhood: Neighborhood; address; seatsTotal: number; dietTags: DietTag[]; allergens: string }`
  - `interface Actor { userId: string; role: Role; verificationStatus: VerificationStatus; suspended: boolean }`
  - `interface MealState { hostId: string; status: MealStatus; startsAt: Date; seatsTotal: number }`
  - `seatsLeft(seatsTotal: number, acceptedCount: number): number`
  - `assertActive(actor)`, `assertCanCreateMeal(actor)`
  - `assertCanEditMeal({ actor, meal, newSeatsTotal, acceptedCount, now })`
  - `assertCanRequest({ actor, meal, acceptedCount, alreadyRequested, now })`
  - `assertCanDecide({ actor, meal, bookingStatus, acceptedCount, decision, now })` avec `decision: "accept" | "decline"`
  - `canSeeAddress({ viewerId: string | null, hostId: string, viewerBookingStatus: BookingStatus | null }): boolean`

- [ ] **Step 1: Types, erreurs et ids**

`src/domain/types.ts` :

```ts
export const ROLES = ["student", "host", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VERIFICATION_STATUSES = ["none", "pending", "verified", "rejected"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MEAL_STATUSES = ["open", "cancelled"] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export const BOOKING_STATUSES = ["pending", "accepted", "declined", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
```

`src/domain/errors.ts` :

```ts
export type DomainErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SUSPENDED"
  | "NOT_VERIFIED"
  | "MEAL_CANCELLED"
  | "MEAL_STARTED"
  | "MEAL_FULL"
  | "ALREADY_REQUESTED"
  | "INVALID_TRANSITION"
  | "SEATS_BELOW_ACCEPTED";

const MESSAGES: Record<DomainErrorCode, string> = {
  FORBIDDEN: "Vous n'avez pas le droit de faire cette action.",
  NOT_FOUND: "Élément introuvable.",
  SUSPENDED: "Votre compte est suspendu.",
  NOT_VERIFIED: "Votre statut étudiant doit être vérifié avant de demander un repas.",
  MEAL_CANCELLED: "Ce repas a été annulé.",
  MEAL_STARTED: "Ce repas a déjà commencé.",
  MEAL_FULL: "Ce repas est complet.",
  ALREADY_REQUESTED: "Vous avez déjà fait une demande pour ce repas.",
  INVALID_TRANSITION: "Cette demande a déjà reçu une réponse.",
  SEATS_BELOW_ACCEPTED: "Le nombre de places ne peut pas être inférieur au nombre d'étudiants déjà acceptés.",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode) {
    super(MESSAGES[code]);
    this.name = "DomainError";
    this.code = code;
  }
}
```

`src/domain/ids.ts` :

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
```

- [ ] **Step 2: Écrire le test de saisie d'un repas (échoue)**

`src/domain/meal-input.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { mealInputSchema } from "./meal-input";

const now = new Date("2026-10-21T10:00:00Z");
const valid = {
  title: "  Blanquette de veau ",
  description: "Une blanquette comme chez ma grand-mère.",
  startsAtLocal: "2026-10-25T19:30",
  neighborhood: "Chartrons",
  address: "12 rue Notre-Dame, 33000 Bordeaux",
  seatsTotal: "2",
  dietTags: ["sans_porc"],
  allergens: "",
};

describe("mealInputSchema", () => {
  it("accepte une saisie valide et convertit la date de Paris", () => {
    const out = mealInputSchema(now).parse(valid);
    expect(out.title).toBe("Blanquette de veau");
    expect(out.seatsTotal).toBe(2);
    expect(out.startsAt.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(out).not.toHaveProperty("startsAtLocal");
  });

  it("refuse un quartier hors liste", () => {
    expect(mealInputSchema(now).safeParse({ ...valid, neighborhood: "Paris 11e" }).success).toBe(false);
  });

  it("refuse une date passée avec un message sur le champ", () => {
    const r = mealInputSchema(now).safeParse({ ...valid, startsAtLocal: "2026-10-20T19:30" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["startsAtLocal"]);
  });

  it("refuse 0 ou 7 places et un régime inconnu", () => {
    expect(mealInputSchema(now).safeParse({ ...valid, seatsTotal: "0" }).success).toBe(false);
    expect(mealInputSchema(now).safeParse({ ...valid, seatsTotal: "7" }).success).toBe(false);
    expect(mealInputSchema(now).safeParse({ ...valid, dietTags: ["pizza"] }).success).toBe(false);
  });

  it("met des valeurs par défaut pour les régimes et allergènes", () => {
    const out = mealInputSchema(now).parse({ ...valid, dietTags: undefined, allergens: undefined });
    expect(out.dietTags).toEqual([]);
    expect(out.allergens).toBe("");
  });
});
```

- [ ] **Step 3: Lancer le test**

Run: `npm test -- src/domain/meal-input.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 4: Implémenter `meal-input.ts`**

```ts
import { z } from "zod";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { DIET_TAG_KEYS } from "@/config/diet-tags";
import { parisLocalToDate } from "./dates";

const baseSchema = z.object({
  title: z.string().trim().min(3, "3 caractères minimum").max(80, "80 caractères maximum"),
  description: z
    .string()
    .trim()
    .min(10, "10 caractères minimum")
    .max(1000, "1000 caractères maximum"),
  startsAtLocal: z.string().min(1, "Indiquez la date et l'heure"),
  neighborhood: z.enum(NEIGHBORHOODS, { error: "Choisissez un quartier dans la liste" }),
  address: z.string().trim().min(5, "Adresse trop courte").max(200, "200 caractères maximum"),
  seatsTotal: z.coerce
    .number({ error: "Indiquez un nombre" })
    .int("Nombre entier attendu")
    .min(1, "Au moins 1 place")
    .max(6, "6 places maximum"),
  dietTags: z.array(z.enum(DIET_TAG_KEYS, { error: "Régime inconnu" })).default([]),
  allergens: z.string().trim().max(200, "200 caractères maximum").default(""),
});

export function mealInputSchema(now: Date) {
  return baseSchema.transform((value, ctx) => {
    let startsAt: Date;
    try {
      startsAt = parisLocalToDate(value.startsAtLocal);
    } catch {
      ctx.addIssue({ code: "custom", path: ["startsAtLocal"], message: "Date et heure invalides" });
      return z.NEVER;
    }
    if (startsAt.getTime() <= now.getTime()) {
      ctx.addIssue({ code: "custom", path: ["startsAtLocal"], message: "La date doit être dans le futur" });
      return z.NEVER;
    }
    return {
      title: value.title,
      description: value.description,
      startsAt,
      neighborhood: value.neighborhood,
      address: value.address,
      seatsTotal: value.seatsTotal,
      dietTags: value.dietTags,
      allergens: value.allergens,
    };
  });
}

export type MealInput = z.output<ReturnType<typeof mealInputSchema>>;
```

- [ ] **Step 5: Lancer le test**

Run: `npm test -- src/domain/meal-input.test.ts`
Expected: PASS.

- [ ] **Step 6: Écrire le test des règles de réservation (échoue)**

`src/domain/bookings.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  assertCanCreateMeal,
  assertCanDecide,
  assertCanEditMeal,
  assertCanRequest,
  canSeeAddress,
  seatsLeft,
  type Actor,
  type MealState,
} from "./bookings";

const now = new Date("2026-10-21T10:00:00Z");
const student: Actor = { userId: "s1", role: "student", verificationStatus: "verified", suspended: false };
const host: Actor = { userId: "h1", role: "host", verificationStatus: "none", suspended: false };
const meal: MealState = { hostId: "h1", status: "open", startsAt: new Date("2026-10-25T18:30:00Z"), seatsTotal: 2 };

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("seatsLeft", () => {
  it("ne descend jamais sous zéro", () => {
    expect(seatsLeft(2, 0)).toBe(2);
    expect(seatsLeft(2, 3)).toBe(0);
  });
});

describe("assertCanCreateMeal", () => {
  it("réserve la création aux hôtes actifs", () => {
    expect(code(() => assertCanCreateMeal(host))).toBeNull();
    expect(code(() => assertCanCreateMeal(student))).toBe("FORBIDDEN");
    expect(code(() => assertCanCreateMeal({ ...host, suspended: true }))).toBe("SUSPENDED");
  });
});

describe("assertCanRequest", () => {
  const base = { actor: student, meal, acceptedCount: 0, alreadyRequested: false, now };

  it("autorise un étudiant vérifié", () => {
    expect(code(() => assertCanRequest(base))).toBeNull();
  });

  it("refuse dans chaque cas interdit", () => {
    expect(code(() => assertCanRequest({ ...base, actor: { ...student, verificationStatus: "pending" } }))).toBe("NOT_VERIFIED");
    expect(code(() => assertCanRequest({ ...base, actor: host }))).toBe("FORBIDDEN");
    expect(code(() => assertCanRequest({ ...base, actor: { ...student, suspended: true } }))).toBe("SUSPENDED");
    expect(code(() => assertCanRequest({ ...base, meal: { ...meal, status: "cancelled" } }))).toBe("MEAL_CANCELLED");
    expect(code(() => assertCanRequest({ ...base, now: new Date("2026-10-26T00:00:00Z") }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanRequest({ ...base, alreadyRequested: true }))).toBe("ALREADY_REQUESTED");
    expect(code(() => assertCanRequest({ ...base, acceptedCount: 2 }))).toBe("MEAL_FULL");
  });
});

describe("assertCanDecide", () => {
  const base = { actor: host, meal, bookingStatus: "pending" as const, acceptedCount: 0, decision: "accept" as const, now };

  it("autorise l'hôte du repas", () => {
    expect(code(() => assertCanDecide(base))).toBeNull();
  });

  it("refuse un autre hôte, une demande déjà traitée, un repas complet", () => {
    expect(code(() => assertCanDecide({ ...base, actor: { ...host, userId: "h2" } }))).toBe("FORBIDDEN");
    expect(code(() => assertCanDecide({ ...base, bookingStatus: "accepted" }))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCanDecide({ ...base, acceptedCount: 2 }))).toBe("MEAL_FULL");
  });

  it("permet de refuser même quand le repas est complet", () => {
    expect(code(() => assertCanDecide({ ...base, acceptedCount: 2, decision: "decline" }))).toBeNull();
  });
});

describe("assertCanEditMeal", () => {
  const base = { actor: host, meal, newSeatsTotal: 2, acceptedCount: 1, now };

  it("autorise l'hôte avant le repas", () => {
    expect(code(() => assertCanEditMeal(base))).toBeNull();
  });

  it("refuse sous le nombre d'acceptés, après le début, ou pour un autre hôte", () => {
    expect(code(() => assertCanEditMeal({ ...base, newSeatsTotal: 0 }))).toBe("SEATS_BELOW_ACCEPTED");
    expect(code(() => assertCanEditMeal({ ...base, now: new Date("2026-10-26T00:00:00Z") }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanEditMeal({ ...base, actor: { ...host, userId: "h2" } }))).toBe("FORBIDDEN");
  });
});

describe("canSeeAddress", () => {
  it("réserve l'adresse à l'hôte et aux étudiants acceptés", () => {
    expect(canSeeAddress({ viewerId: "h1", hostId: "h1", viewerBookingStatus: null })).toBe(true);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: "accepted" })).toBe(true);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: "pending" })).toBe(false);
    expect(canSeeAddress({ viewerId: "s1", hostId: "h1", viewerBookingStatus: null })).toBe(false);
    expect(canSeeAddress({ viewerId: null, hostId: "h1", viewerBookingStatus: null })).toBe(false);
  });
});
```

- [ ] **Step 7: Lancer le test**

Run: `npm test -- src/domain/bookings.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 8: Implémenter `bookings.ts`**

```ts
import { DomainError } from "./errors";
import type { BookingStatus, MealStatus, Role, VerificationStatus } from "./types";

export interface Actor {
  userId: string;
  role: Role;
  verificationStatus: VerificationStatus;
  suspended: boolean;
}

export interface MealState {
  hostId: string;
  status: MealStatus;
  startsAt: Date;
  seatsTotal: number;
}

export function seatsLeft(seatsTotal: number, acceptedCount: number): number {
  return Math.max(0, seatsTotal - acceptedCount);
}

export function assertActive(actor: Actor): void {
  if (actor.suspended) throw new DomainError("SUSPENDED");
}

export function assertCanCreateMeal(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "host") throw new DomainError("FORBIDDEN");
}

function assertMealOpen(meal: MealState, now: Date): void {
  if (meal.status === "cancelled") throw new DomainError("MEAL_CANCELLED");
  if (meal.startsAt.getTime() <= now.getTime()) throw new DomainError("MEAL_STARTED");
}

export function assertCanEditMeal(args: {
  actor: Actor;
  meal: MealState;
  newSeatsTotal: number;
  acceptedCount: number;
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  assertMealOpen(args.meal, args.now);
  if (args.newSeatsTotal < args.acceptedCount) throw new DomainError("SEATS_BELOW_ACCEPTED");
}

export function assertCanRequest(args: {
  actor: Actor;
  meal: MealState;
  acceptedCount: number;
  alreadyRequested: boolean;
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.role !== "student") throw new DomainError("FORBIDDEN");
  if (args.actor.verificationStatus !== "verified") throw new DomainError("NOT_VERIFIED");
  assertMealOpen(args.meal, args.now);
  if (args.alreadyRequested) throw new DomainError("ALREADY_REQUESTED");
  if (seatsLeft(args.meal.seatsTotal, args.acceptedCount) === 0) throw new DomainError("MEAL_FULL");
}

export function assertCanDecide(args: {
  actor: Actor;
  meal: MealState;
  bookingStatus: BookingStatus;
  acceptedCount: number;
  decision: "accept" | "decline";
  now: Date;
}): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  if (args.bookingStatus !== "pending") throw new DomainError("INVALID_TRANSITION");
  assertMealOpen(args.meal, args.now);
  if (args.decision === "accept" && seatsLeft(args.meal.seatsTotal, args.acceptedCount) === 0) {
    throw new DomainError("MEAL_FULL");
  }
}

export function canSeeAddress(args: {
  viewerId: string | null;
  hostId: string;
  viewerBookingStatus: BookingStatus | null;
}): boolean {
  if (!args.viewerId) return false;
  return args.viewerId === args.hostId || args.viewerBookingStatus === "accepted";
}
```

- [ ] **Step 9: Lancer tous les tests unitaires**

Run: `npm test`
Expected: PASS (dates, meal-input, bookings).

- [ ] **Step 10: Commit**

```bash
git add src/domain
git commit -m "feat: règles métier des repas et des réservations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Schéma de base de données, migrations et harnais d'intégration

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/` (généré)
- Create: `tests/integration/helpers.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: enums de `src/domain/types.ts`, `DietTag` (Task 3).
- Produces:
  - Tables `profiles`, `meals`, `bookings` ; types `Profile = typeof profiles.$inferSelect`, `Meal = typeof meals.$inferSelect`, `Booking = typeof bookings.$inferSelect`
  - `createDb(connectionString: string)`, `type Db`, `getDb(): Db`
  - Helpers de test : `db`, `resetDb()`, `closeDb()`, `makeProfile(overrides?)`, `makeMeal(hostId, overrides?)`, `makeBooking(mealId, studentId, status?)`

- [ ] **Step 1: Écrire le schéma**

`src/db/schema.ts` :

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
// Imports relatifs : drizzle-kit charge ce fichier sans les alias de tsconfig.
import type { DietTag } from "../config/diet-tags";
import { BOOKING_STATUSES, MEAL_STATUSES, ROLES, VERIFICATION_STATUSES } from "../domain/types";

export const roleEnum = pgEnum("role", ROLES);
export const verificationStatusEnum = pgEnum("verification_status", VERIFICATION_STATUSES);
export const mealStatusEnum = pgEnum("meal_status", MEAL_STATUSES);
export const bookingStatusEnum = pgEnum("booking_status", BOOKING_STATUSES);

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  role: roleEnum("role").notNull(),
  firstName: text("first_name").notNull(),
  bio: text("bio").notNull().default(""),
  school: text("school"),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("none"),
  suspended: boolean("suspended").notNull().default(false),
  ...timestamps(),
});

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    neighborhood: text("neighborhood").notNull(),
    address: text("address").notNull(),
    seatsTotal: integer("seats_total").notNull(),
    dietTags: text("diet_tags")
      .array()
      .$type<DietTag[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    allergens: text("allergens").notNull().default(""),
    status: mealStatusEnum("status").notNull().default("open"),
    cancelReason: text("cancel_reason"),
    ...timestamps(),
  },
  (t) => [index("meals_starts_at_idx").on(t.startsAt), index("meals_host_idx").on(t.hostId)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    requestMessage: text("request_message").notNull().default(""),
    status: bookingStatusEnum("status").notNull().default("pending"),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    ...timestamps(),
  },
  (t) => [
    unique("bookings_meal_student_unique").on(t.mealId, t.studentId),
    index("bookings_student_idx").on(t.studentId),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
```

- [ ] **Step 2: Client et configuration drizzle-kit**

`src/db/client.ts` :

```ts
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

export function createDb(connectionString: string) {
  return drizzle({ client: new Pool({ connectionString }) });
}

export type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquant");
    cached = createDb(url);
  }
  return cached;
}
```

`drizzle.config.ts` :

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const url =
  process.env.DB_TARGET === "test" ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
if (!url) throw new Error("Chaîne de connexion manquante dans .env.local");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
```

- [ ] **Step 3: Générer et appliquer la migration sur `demo` et `test`**

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:test
```

Expected: un fichier `drizzle/0000_*.sql` est créé, et les deux `migrate` se terminent sans erreur.

- [ ] **Step 4: Harnais d'intégration**

`tests/integration/helpers.ts` :

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import type { BookingStatus } from "@/domain/types";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST manquant dans .env.local");

export const db = createDb(url);

export async function resetDb() {
  await db.execute(sql`truncate table bookings, meals, profiles cascade`);
}

export async function closeDb() {
  await db.$client.end();
}

export async function makeProfile(overrides: Partial<typeof profiles.$inferInsert> = {}) {
  const [row] = await db
    .insert(profiles)
    .values({
      userId: `user_${crypto.randomUUID()}`,
      role: "student",
      firstName: "Test",
      verificationStatus: "verified",
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeMeal(hostId: string, overrides: Partial<typeof meals.$inferInsert> = {}) {
  const [row] = await db
    .insert(meals)
    .values({
      hostId,
      title: "Gratin dauphinois",
      description: "Un bon gratin maison avec une salade.",
      startsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
      neighborhood: "Chartrons",
      address: "12 rue Notre-Dame, 33000 Bordeaux",
      seatsTotal: 2,
      ...overrides,
    })
    .returning();
  return row;
}

export async function makeBooking(mealId: string, studentId: string, status: BookingStatus = "pending") {
  const [row] = await db.insert(bookings).values({ mealId, studentId, status }).returning();
  return row;
}
```

- [ ] **Step 5: Écrire le test du schéma**

`tests/integration/schema.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("schéma", () => {
  it("enregistre un profil, un repas et une réservation", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId, { dietTags: ["halal"] });
    const booking = await makeBooking(meal.id, student.userId);
    expect(meal.dietTags).toEqual(["halal"]);
    expect(meal.status).toBe("open");
    expect(booking.status).toBe("pending");
  });

  it("interdit deux demandes du même étudiant pour un repas", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    await makeBooking(meal.id, student.userId);
    await expect(makeBooking(meal.id, student.userId)).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Lancer**

Run: `npm run test:integration`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/db drizzle drizzle.config.ts tests/integration
git commit -m "feat: schéma Postgres (profils, repas, réservations) et harnais d'intégration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Authentification, session et choix du profil

**Files:**
- Create: `src/lib/auth/server.ts`, `src/lib/auth/client.ts`, `src/app/api/auth/[...path]/route.ts`, `src/proxy.ts`
- Create: `src/server/session.ts`, `src/server/form-state.ts`, `src/server/profiles/service.ts`, `src/server/profiles/actions.ts`
- Create: `src/components/ui.tsx`, `src/components/form-message.tsx`, `src/components/auth-forms.tsx`, `src/components/onboarding-form.tsx`
- Create: `src/app/connexion/page.tsx`, `src/app/inscription/page.tsx`, `src/app/bienvenue/page.tsx`, `src/app/compte-suspendu/page.tsx`
- Test: `tests/integration/profiles.test.ts`

**Interfaces:**
- Consumes: `getDb`, `profiles`, `Profile` (Task 5) ; `Role` (Task 4) ; `DomainError` (Task 4).
- Produces:
  - `auth` (serveur) et `authClient` (navigateur)
  - `getSessionUser(): Promise<{ id: string; name: string; email: string } | null>`
  - `getCurrentProfile(): Promise<Profile | null>`
  - `requireProfile(role?: Role): Promise<Profile>` : redirige vers `/connexion`, `/bienvenue`, `/compte-suspendu` ou l'accueil du rôle
  - `homeFor(role: Role): string`
  - `type FormState = { error?: string; fieldErrors?: Record<string, string[] | undefined>; values?: Record<string, string | string[]>; ok?: boolean }`
  - `formValues(fd: FormData, multi?: readonly string[]): Record<string, string | string[]>`
  - `toFormState(error: unknown, values?: Record<string, string | string[]>): FormState` (relance toute erreur qui n'est ni `DomainError` ni `ZodError`)
  - `createProfile(db: Db, userId: string, raw: unknown): Promise<Profile>`
  - Composants `Button`, `LinkButton`, `Input`, `Textarea`, `Select`, `Label`, `Card`, `Badge` ; `FormError`, `FieldError`

- [ ] **Step 1: Écrire le test du service profil (échoue)**

`tests/integration/profiles.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createProfile } from "@/server/profiles/service";
import { closeDb, db, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("createProfile", () => {
  it("crée un étudiant non vérifié avec son école", async () => {
    const p = await createProfile(db, "u1", { role: "student", firstName: " Léa ", school: "Université de Bordeaux" });
    expect(p).toMatchObject({ userId: "u1", role: "student", firstName: "Léa", verificationStatus: "none", school: "Université de Bordeaux" });
  });

  it("crée un hôte sans école", async () => {
    const p = await createProfile(db, "u2", { role: "host", firstName: "Mireille", school: "ignorée" });
    expect(p.role).toBe("host");
    expect(p.school).toBeNull();
  });

  it("exige une école pour un étudiant", async () => {
    await expect(createProfile(db, "u3", { role: "student", firstName: "Léa", school: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("refuse de créer un admin depuis le formulaire", async () => {
    await expect(createProfile(db, "u4", { role: "admin", firstName: "X", school: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("est idempotent : un second appel renvoie le profil existant", async () => {
    await createProfile(db, "u5", { role: "host", firstName: "Jean", school: "" });
    const again = await createProfile(db, "u5", { role: "student", firstName: "Autre", school: "École" });
    expect(again).toMatchObject({ role: "host", firstName: "Jean" });
  });
});
```

Run: `npm run test:integration -- tests/integration/profiles.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter le service profil**

`src/server/profiles/service.ts` :

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";

const profileSchema = z
  .object({
    role: z.enum(["student", "host"], { error: "Choisissez votre profil" }),
    firstName: z.string().trim().min(1, "Indiquez votre prénom").max(40, "40 caractères maximum"),
    school: z.string().trim().max(80, "80 caractères maximum").default(""),
  })
  .refine((v) => v.role !== "student" || v.school.length > 0, {
    path: ["school"],
    message: "Indiquez votre établissement",
  });

export async function createProfile(db: Db, userId: string, raw: unknown): Promise<Profile> {
  const input = profileSchema.parse(raw);
  await db
    .insert(profiles)
    .values({
      userId,
      role: input.role,
      firstName: input.firstName,
      school: input.role === "student" ? input.school : null,
    })
    .onConflictDoNothing();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return profile;
}
```

Run: `npm run test:integration -- tests/integration/profiles.test.ts`
Expected: PASS.

- [ ] **Step 3: Brancher Neon Auth**

`src/lib/auth/server.ts` :

```ts
import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});
```

`src/lib/auth/client.ts` :

```ts
"use client";
import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();
```

`src/app/api/auth/[...path]/route.ts` :

```ts
import { auth } from "@/lib/auth/server";

export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
```

`src/proxy.ts` :

```ts
import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/connexion" });

export const config = {
  matcher: ["/etudiant/:path*", "/hote/:path*", "/bienvenue"],
};
```

- [ ] **Step 4: Session et état des formulaires**

`src/server/session.ts` :

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { profiles, type Profile } from "@/db/schema";
import type { Role } from "@/domain/types";
import { auth } from "@/lib/auth/server";

export async function getSessionUser(): Promise<{ id: string; name: string; email: string } | null> {
  const { data } = await auth.getSession();
  const user = data?.user;
  return user ? { id: user.id, name: user.name ?? "", email: user.email } : null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  return profile ?? null;
}

export function homeFor(role: Role): string {
  if (role === "host") return "/hote/offres";
  return "/repas";
}

export async function requireProfile(role?: Role): Promise<Profile> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  if (!profile) redirect("/bienvenue");
  if (profile.suspended) redirect("/compte-suspendu");
  if (role && profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}
```

`src/server/form-state.ts` :

```ts
import { ZodError, z } from "zod";
import { DomainError } from "@/domain/errors";

export type FormValues = Record<string, string | string[]>;

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: FormValues;
  ok?: boolean;
};

export function formValues(fd: FormData, multi: readonly string[] = []): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = multi.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? "");
  }
  for (const key of multi) out[key] ??= [];
  return out;
}

export function toFormState(error: unknown, values?: FormValues): FormState {
  if (error instanceof DomainError) return { error: error.message, values };
  if (error instanceof ZodError) {
    return {
      error: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
      values,
    };
  }
  throw error;
}
```

- [ ] **Step 5: Primitives d'UI**

`src/components/ui.tsx` :

```tsx
import Link from "next/link";
import type { ComponentProps } from "react";

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
const buttonVariants = {
  primary: "bg-orange-600 text-white hover:bg-orange-700",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
} as const;
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

const fieldBase =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldBase, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldBase, className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("block text-sm font-medium text-stone-800", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-stone-200 bg-white p-4 shadow-sm", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-stone-100 text-stone-700",
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-800",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)} {...props} />;
}
```

`src/components/form-message.tsx` :

```tsx
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-sm text-red-700">{errors[0]}</p>;
}
```

- [ ] **Step 6: Formulaires d'inscription et de connexion**

`src/components/auth-forms.tsx` :

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button, Input, Label } from "@/components/ui";
import { FormError } from "@/components/form-message";

function useAuthSubmit(run: (fd: FormData) => Promise<{ error: { message?: string } | null }>, fallback: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const { error } = await run(new FormData(event.currentTarget));
    setPending(false);
    if (error) {
      setError(error.message || fallback);
      return;
    }
    router.push("/bienvenue");
    router.refresh();
  }

  return { pending, error, onSubmit };
}

export function SignUpForm() {
  const { pending, error, onSubmit } = useAuthSubmit(
    (fd) =>
      authClient.signUp.email({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
      }),
    "Inscription impossible. Vérifiez vos informations.",
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Prénom</Label>
        <Input id="name" name="name" autoComplete="given-name" required maxLength={40} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe (8 caractères minimum)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création du compte…" : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-stone-600">
        Déjà inscrit ? <Link href="/connexion" className="font-medium text-orange-700 underline">Se connecter</Link>
      </p>
    </form>
  );
}

export function SignInForm() {
  const { pending, error, onSubmit } = useAuthSubmit(
    (fd) => authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) }),
    "Email ou mot de passe incorrect.",
  );
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-sm text-stone-600">
        Pas encore de compte ? <Link href="/inscription" className="font-medium text-orange-700 underline">S'inscrire</Link>
      </p>
    </form>
  );
}
```

`src/app/inscription/page.tsx` :

```tsx
import { SignUpForm } from "@/components/auth-forms";

export default function SignUpPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Créer un compte</h1>
      <SignUpForm />
    </main>
  );
}
```

`src/app/connexion/page.tsx` (le bloc de connexion rapide de démo s'ajoute en Task 11) :

```tsx
import { SignInForm } from "@/components/auth-forms";

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Se connecter</h1>
      <SignInForm />
    </main>
  );
}
```

- [ ] **Step 7: Choix du profil après inscription**

`src/server/profiles/actions.ts` :

```ts
"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Role } from "@/domain/types";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { getSessionUser, homeFor } from "@/server/session";
import { createProfile } from "./service";

export async function createProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const values = formValues(fd);
  let role: Role;
  try {
    ({ role } = await createProfile(getDb(), user.id, values));
  } catch (error) {
    return toFormState(error, values);
  }
  redirect(homeFor(role));
}
```

`src/components/onboarding-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { createProfileAction } from "@/server/profiles/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function OnboardingForm({ defaultFirstName }: { defaultFirstName: string }) {
  const [state, action, pending] = useActionState(createProfileAction, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Vous êtes…</legend>
        <label className="flex items-start gap-3 rounded-lg border border-stone-300 bg-white p-3">
          <input type="radio" name="role" value="student" defaultChecked={v.role === "student"} className="mt-1" />
          <span><strong>Étudiant·e</strong> — je cherche un repas partagé</span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-stone-300 bg-white p-3">
          <input type="radio" name="role" value="host" defaultChecked={v.role === "host"} className="mt-1" />
          <span><strong>Hôte</strong> — je cuisine une portion de plus à partager</span>
        </label>
        <FieldError errors={fe.role} />
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="firstName">Prénom</Label>
        <Input id="firstName" name="firstName" defaultValue={(v.firstName as string) ?? defaultFirstName} required maxLength={40} />
        <FieldError errors={fe.firstName} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="school">Établissement (étudiants uniquement)</Label>
        <Input id="school" name="school" defaultValue={(v.school as string) ?? ""} placeholder="Ex. : Université de Bordeaux" maxLength={80} />
        <FieldError errors={fe.school} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : "Continuer"}
      </Button>
    </form>
  );
}
```

`src/app/bienvenue/page.tsx` :

```tsx
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getCurrentProfile, getSessionUser, homeFor } from "@/server/session";

export default async function WelcomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const profile = await getCurrentProfile();
  if (profile) redirect(homeFor(profile.role));
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Bienvenue sur Ocleans</h1>
      <p className="text-stone-600">Dites-nous qui vous êtes pour finir votre inscription.</p>
      <OnboardingForm defaultFirstName={user.name} />
    </main>
  );
}
```

`src/app/compte-suspendu/page.tsx` :

```tsx
export default function SuspendedPage() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Compte suspendu</h1>
      <p className="text-stone-600">
        Votre compte a été suspendu suite à un signalement. Contactez l'équipe Ocleans si vous pensez qu'il s'agit d'une erreur.
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Vérifier**

Run: `npm run lint && npm run build && npm test && npm run test:integration`
Expected: tout passe.

Puis vérifier à la main : `npm run dev`, ouvrir `http://localhost:3000/inscription`, créer un compte `test-hote@example.com`. **Avant** de choisir un rôle, ouvrir `http://localhost:3000/etudiant/mes-repas` : redirection attendue vers `/bienvenue`, sans erreur. Ensuite, choisir « Hôte ». Résultat attendu : redirection vers `/hote/offres` (404 à ce stade, c'est normal). Avec `run_sql` sur la branche `demo`, `select role, first_name from profiles` doit renvoyer la ligne. Ensuite, supprimer ce compte de test : `delete from profiles where first_name = '<prénom saisi>'` puis `delete from neon_auth."user" where email = 'test-hote@example.com'`. Si cette table n'existe pas sous ce nom, lister d'abord les tables du schéma `neon_auth` avec `select table_name from information_schema.tables where table_schema = 'neon_auth'`.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "feat: inscription, connexion Neon Auth et choix du profil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Service des repas

**Files:**
- Create: `src/server/meals/service.ts`
- Test: `tests/integration/meals.test.ts`

**Interfaces:**
- Consumes: `Db`, `meals`, `bookings`, `profiles` (Task 5) ; `Actor`, `seatsLeft`, `assertCanCreateMeal`, `assertCanEditMeal`, `canSeeAddress`, `DomainError`, `isUuid`, `mealInputSchema` (Task 4) ; `isNeighborhood`, `isDietTag`, `isDayString`, `nextDay`, `parisLocalToDate` (Task 3).
- Produces:
  - `interface PublicMeal { id: string; title: string; description: string; startsAt: Date; neighborhood: string; seatsTotal: number; seatsLeft: number; dietTags: DietTag[]; allergens: string; status: MealStatus; hostId: string; hostFirstName: string }`
  - `interface MealDetail extends PublicMeal { address: string | null; viewerBooking: { id: string; status: BookingStatus } | null }`
  - `interface HostMealRequest { id: string; status: BookingStatus; requestMessage: string; createdAt: Date; studentFirstName: string; studentSchool: string | null; studentVerified: boolean }`
  - `interface HostMeal { id; title; description; startsAt: Date; neighborhood; address: string; seatsTotal; seatsLeft; dietTags: DietTag[]; allergens; status: MealStatus; requests: HostMealRequest[] }`
  - `interface MealFilters { neighborhood?: string; dietTag?: string; day?: string }`
  - `createMeal(db, actor, raw, now?): Promise<{ id: string }>`
  - `updateMeal(db, actor, mealId, raw, now?): Promise<void>`
  - `listUpcomingMeals(db, filters, now?): Promise<PublicMeal[]>`
  - `getMealForViewer(db, viewer: Actor | null, mealId): Promise<MealDetail | null>`
  - `listHostMeals(db, actor): Promise<HostMeal[]>`
  - `getHostMeal(db, actor, mealId): Promise<HostMeal | null>`
  - `countAccepted(db: Db | Tx, mealId: string): Promise<number>` et `type Tx`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/meals.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { dateToParisLocal } from "@/domain/dates";
import {
  createMeal,
  getHostMeal,
  getMealForViewer,
  listHostMeals,
  listUpcomingMeals,
  updateMeal,
} from "@/server/meals/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;
const localIn = (days: number) => `${dateToParisLocal(new Date(Date.now() + days * DAY)).slice(0, 10)}T19:30`;
const validRaw = (over: Record<string, unknown> = {}) => ({
  title: "Blanquette de veau",
  description: "Une blanquette comme chez ma grand-mère.",
  startsAtLocal: localIn(3),
  neighborhood: "Chartrons",
  address: "12 rue Notre-Dame, 33000 Bordeaux",
  seatsTotal: "2",
  dietTags: ["sans_porc"],
  allergens: "",
  ...over,
});

beforeEach(resetDb);
afterAll(closeDb);

describe("createMeal", () => {
  it("crée un repas pour un hôte", async () => {
    const host = await makeProfile({ role: "host" });
    const { id } = await createMeal(db, host, validRaw());
    const meal = await getHostMeal(db, host, id);
    expect(meal).toMatchObject({ title: "Blanquette de veau", seatsTotal: 2, seatsLeft: 2, dietTags: ["sans_porc"], requests: [] });
  });

  it("refuse un étudiant", async () => {
    const student = await makeProfile();
    await expect(createMeal(db, student, validRaw())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuse une date passée", async () => {
    const host = await makeProfile({ role: "host" });
    await expect(createMeal(db, host, validRaw({ startsAtLocal: localIn(-1) }))).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listUpcomingMeals", () => {
  it("n'expose jamais l'adresse", async () => {
    const host = await makeProfile({ role: "host" });
    await makeMeal(host.userId);
    const [meal] = await listUpcomingMeals(db, {});
    expect(meal).not.toHaveProperty("address");
    expect(JSON.stringify(meal)).not.toContain("rue Notre-Dame");
  });

  it("exclut les repas passés, annulés et ceux d'un hôte suspendu", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const suspended = await makeProfile({ role: "host", suspended: true });
    await makeMeal(host.userId, { title: "Visible" });
    await makeMeal(host.userId, { title: "Passé", startsAt: new Date(Date.now() - DAY) });
    await makeMeal(host.userId, { title: "Annulé", status: "cancelled" });
    await makeMeal(suspended.userId, { title: "Suspendu" });
    const list = await listUpcomingMeals(db, {});
    expect(list.map((m) => m.title)).toEqual(["Visible"]);
    expect(list[0].hostFirstName).toBe("Mireille");
  });

  it("filtre par quartier, régime et jour", async () => {
    const host = await makeProfile({ role: "host" });
    const target = new Date(Date.now() + 5 * DAY);
    await makeMeal(host.userId, { title: "A", neighborhood: "Bastide", dietTags: ["halal"], startsAt: target });
    await makeMeal(host.userId, { title: "B", neighborhood: "Chartrons", dietTags: ["vegetarien"] });
    expect((await listUpcomingMeals(db, { neighborhood: "Bastide" })).map((m) => m.title)).toEqual(["A"]);
    expect((await listUpcomingMeals(db, { dietTag: "vegetarien" })).map((m) => m.title)).toEqual(["B"]);
    const day = dateToParisLocal(target).slice(0, 10);
    expect((await listUpcomingMeals(db, { day })).map((m) => m.title)).toEqual(["A"]);
  });

  it("ignore des filtres invalides sans planter", async () => {
    const host = await makeProfile({ role: "host" });
    await makeMeal(host.userId);
    const list = await listUpcomingMeals(db, { neighborhood: "Paris", dietTag: "pizza", day: "demain" });
    expect(list).toHaveLength(1);
  });

  it("calcule les places restantes à partir des acceptés", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 3 });
    await makeBooking(meal.id, s1.userId, "accepted");
    await makeBooking(meal.id, s2.userId, "pending");
    const [m] = await listUpcomingMeals(db, {});
    expect(m.seatsLeft).toBe(2);
  });
});

describe("getMealForViewer", () => {
  it("révèle l'adresse seulement à l'hôte et à l'étudiant accepté", async () => {
    const host = await makeProfile({ role: "host" });
    const accepted = await makeProfile();
    const pending = await makeProfile();
    const other = await makeProfile();
    const meal = await makeMeal(host.userId);
    await makeBooking(meal.id, accepted.userId, "accepted");
    await makeBooking(meal.id, pending.userId, "pending");

    expect((await getMealForViewer(db, null, meal.id))?.address).toBeNull();
    expect((await getMealForViewer(db, other, meal.id))?.address).toBeNull();
    const forPending = await getMealForViewer(db, pending, meal.id);
    expect(forPending?.address).toBeNull();
    expect(forPending?.viewerBooking?.status).toBe("pending");
    expect((await getMealForViewer(db, accepted, meal.id))?.address).toBe("12 rue Notre-Dame, 33000 Bordeaux");
    expect((await getMealForViewer(db, host, meal.id))?.address).toBe("12 rue Notre-Dame, 33000 Bordeaux");
  });

  it("renvoie null pour un id invalide ou un hôte suspendu", async () => {
    const suspended = await makeProfile({ role: "host", suspended: true });
    const meal = await makeMeal(suspended.userId);
    expect(await getMealForViewer(db, null, "abc")).toBeNull();
    expect(await getMealForViewer(db, null, meal.id)).toBeNull();
  });
});

describe("updateMeal et listHostMeals", () => {
  it("refuse de descendre sous le nombre d'acceptés", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 2 });
    await makeBooking(meal.id, s.userId, "accepted");
    await expect(updateMeal(db, host, meal.id, validRaw({ seatsTotal: "0" }))).rejects.toBeInstanceOf(ZodError);
    const third = await makeProfile();
    await makeBooking(meal.id, third.userId, "accepted");
    await expect(updateMeal(db, host, meal.id, validRaw({ seatsTotal: "1" }))).rejects.toMatchObject({ code: "SEATS_BELOW_ACCEPTED" });
  });

  it("refuse la modification par un autre hôte", async () => {
    const host = await makeProfile({ role: "host" });
    const intruder = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId);
    await expect(updateMeal(db, intruder, meal.id, validRaw())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("modifie le repas et liste les demandes reçues", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile({ firstName: "Léa", school: "Université de Bordeaux" });
    const meal = await makeMeal(host.userId);
    await makeBooking(meal.id, s.userId, "pending");
    await updateMeal(db, host, meal.id, validRaw({ title: "Pot-au-feu" }));
    const [hm] = await listHostMeals(db, host);
    expect(hm.title).toBe("Pot-au-feu");
    expect(hm.requests).toMatchObject([{ status: "pending", studentFirstName: "Léa", studentSchool: "Université de Bordeaux", studentVerified: true }]);
    expect(await getHostMeal(db, await makeProfile({ role: "host" }), meal.id)).toBeNull();
  });
});
```

Run: `npm run test:integration -- tests/integration/meals.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter le service**

`src/server/meals/service.ts` :

```ts
import { and, arrayContains, asc, count, desc, eq, gt, gte, inArray, lt, type SQL } from "drizzle-orm";
import type { DietTag } from "@/config/diet-tags";
import { isDietTag } from "@/config/diet-tags";
import { isNeighborhood } from "@/config/neighborhoods";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import {
  assertCanCreateMeal,
  assertCanEditMeal,
  canSeeAddress,
  seatsLeft,
  type Actor,
} from "@/domain/bookings";
import { isDayString, nextDay, parisLocalToDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import { mealInputSchema } from "@/domain/meal-input";
import type { BookingStatus, MealStatus } from "@/domain/types";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface PublicMeal {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  neighborhood: string;
  seatsTotal: number;
  seatsLeft: number;
  dietTags: DietTag[];
  allergens: string;
  status: MealStatus;
  hostId: string;
  hostFirstName: string;
}

export interface MealDetail extends PublicMeal {
  address: string | null;
  viewerBooking: { id: string; status: BookingStatus } | null;
}

export interface HostMealRequest {
  id: string;
  status: BookingStatus;
  requestMessage: string;
  createdAt: Date;
  studentFirstName: string;
  studentSchool: string | null;
  studentVerified: boolean;
}

export interface HostMeal {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  neighborhood: string;
  address: string;
  seatsTotal: number;
  seatsLeft: number;
  dietTags: DietTag[];
  allergens: string;
  status: MealStatus;
  requests: HostMealRequest[];
}

export interface MealFilters {
  neighborhood?: string;
  dietTag?: string;
  day?: string;
}

// Colonnes publiques : l'adresse n'en fait volontairement pas partie.
const publicMealColumns = {
  id: meals.id,
  title: meals.title,
  description: meals.description,
  startsAt: meals.startsAt,
  neighborhood: meals.neighborhood,
  seatsTotal: meals.seatsTotal,
  dietTags: meals.dietTags,
  allergens: meals.allergens,
  status: meals.status,
  hostId: meals.hostId,
  hostFirstName: profiles.firstName,
};

export async function countAccepted(db: Db | Tx, mealId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.mealId, mealId), eq(bookings.status, "accepted")));
  return Number(row?.n ?? 0);
}

async function acceptedCounts(db: Db, mealIds: string[]): Promise<Map<string, number>> {
  if (mealIds.length === 0) return new Map();
  const rows = await db
    .select({ mealId: bookings.mealId, n: count() })
    .from(bookings)
    .where(and(inArray(bookings.mealId, mealIds), eq(bookings.status, "accepted")))
    .groupBy(bookings.mealId);
  return new Map(rows.map((r) => [r.mealId, Number(r.n)]));
}

export async function createMeal(db: Db, actor: Actor, raw: unknown, now = new Date()): Promise<{ id: string }> {
  assertCanCreateMeal(actor);
  const input = mealInputSchema(now).parse(raw);
  const [row] = await db
    .insert(meals)
    .values({ hostId: actor.userId, ...input })
    .returning({ id: meals.id });
  return row;
}

export async function updateMeal(db: Db, actor: Actor, mealId: string, raw: unknown, now = new Date()): Promise<void> {
  const input = mealInputSchema(now).parse(raw);
  if (!isUuid(mealId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [meal] = await tx.select().from(meals).where(eq(meals.id, mealId)).for("update");
    if (!meal) throw new DomainError("NOT_FOUND");
    const acceptedCount = await countAccepted(tx, mealId);
    assertCanEditMeal({ actor, meal, newSeatsTotal: input.seatsTotal, acceptedCount, now });
    await tx.update(meals).set(input).where(eq(meals.id, mealId));
  });
}

export async function listUpcomingMeals(db: Db, filters: MealFilters, now = new Date()): Promise<PublicMeal[]> {
  const conditions: SQL[] = [eq(meals.status, "open"), gt(meals.startsAt, now), eq(profiles.suspended, false)];
  if (filters.neighborhood && isNeighborhood(filters.neighborhood)) {
    conditions.push(eq(meals.neighborhood, filters.neighborhood));
  }
  if (filters.dietTag && isDietTag(filters.dietTag)) {
    conditions.push(arrayContains(meals.dietTags, [filters.dietTag]));
  }
  if (filters.day && isDayString(filters.day)) {
    conditions.push(gte(meals.startsAt, parisLocalToDate(`${filters.day}T00:00`)));
    conditions.push(lt(meals.startsAt, parisLocalToDate(`${nextDay(filters.day)}T00:00`)));
  }
  const rows = await db
    .select(publicMealColumns)
    .from(meals)
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(and(...conditions))
    .orderBy(asc(meals.startsAt));
  const counts = await acceptedCounts(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, seatsLeft: seatsLeft(r.seatsTotal, counts.get(r.id) ?? 0) }));
}

export async function getMealForViewer(db: Db, viewer: Actor | null, mealId: string): Promise<MealDetail | null> {
  if (!isUuid(mealId)) return null;
  const [row] = await db
    .select(publicMealColumns)
    .from(meals)
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(and(eq(meals.id, mealId), eq(profiles.suspended, false)))
    .limit(1);
  if (!row) return null;

  let viewerBooking: MealDetail["viewerBooking"] = null;
  if (viewer) {
    const [b] = await db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.mealId, mealId), eq(bookings.studentId, viewer.userId)))
      .limit(1);
    viewerBooking = b ?? null;
  }

  let address: string | null = null;
  if (canSeeAddress({ viewerId: viewer?.userId ?? null, hostId: row.hostId, viewerBookingStatus: viewerBooking?.status ?? null })) {
    const [a] = await db.select({ address: meals.address }).from(meals).where(eq(meals.id, mealId));
    address = a.address;
  }

  return { ...row, seatsLeft: seatsLeft(row.seatsTotal, await countAccepted(db, mealId)), address, viewerBooking };
}

async function loadHostMeals(db: Db, actor: Actor, mealId?: string): Promise<HostMeal[]> {
  const conditions: SQL[] = [eq(meals.hostId, actor.userId)];
  if (mealId) conditions.push(eq(meals.id, mealId));
  const rows = await db
    .select({
      id: meals.id,
      title: meals.title,
      description: meals.description,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      address: meals.address,
      seatsTotal: meals.seatsTotal,
      dietTags: meals.dietTags,
      allergens: meals.allergens,
      status: meals.status,
    })
    .from(meals)
    .where(and(...conditions))
    .orderBy(desc(meals.startsAt));
  if (rows.length === 0) return [];

  const requests = await db
    .select({
      id: bookings.id,
      mealId: bookings.mealId,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      createdAt: bookings.createdAt,
      studentFirstName: profiles.firstName,
      studentSchool: profiles.school,
      studentVerification: profiles.verificationStatus,
    })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.userId, bookings.studentId))
    .where(inArray(bookings.mealId, rows.map((r) => r.id)))
    .orderBy(asc(bookings.createdAt));

  return rows.map((meal) => {
    const own = requests.filter((r) => r.mealId === meal.id);
    const accepted = own.filter((r) => r.status === "accepted").length;
    return {
      ...meal,
      seatsLeft: seatsLeft(meal.seatsTotal, accepted),
      requests: own.map((r) => ({
        id: r.id,
        status: r.status,
        requestMessage: r.requestMessage,
        createdAt: r.createdAt,
        studentFirstName: r.studentFirstName,
        studentSchool: r.studentSchool,
        studentVerified: r.studentVerification === "verified",
      })),
    };
  });
}

export function listHostMeals(db: Db, actor: Actor): Promise<HostMeal[]> {
  return loadHostMeals(db, actor);
}

export async function getHostMeal(db: Db, actor: Actor, mealId: string): Promise<HostMeal | null> {
  if (!isUuid(mealId)) return null;
  const [meal] = await loadHostMeals(db, actor, mealId);
  return meal ?? null;
}
```

- [ ] **Step 3: Lancer**

Run: `npm run test:integration -- tests/integration/meals.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/meals/service.ts tests/integration/meals.test.ts
git commit -m "feat: service des repas (création, liste filtrée, fiche, offres de l'hôte)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Service des réservations

**Files:**
- Create: `src/server/bookings/service.ts`
- Test: `tests/integration/bookings.test.ts`

**Interfaces:**
- Consumes: `countAccepted`, `Tx` (Task 7) ; `assertCanRequest`, `assertCanDecide`, `canSeeAddress`, `Actor`, `DomainError`, `isUuid` (Task 4) ; tables (Task 5).
- Produces:
  - `requestBooking(db, actor, mealId, raw: { message?: unknown }, now?): Promise<{ id: string }>`
  - `decideBooking(db, actor, bookingId, decision: "accept" | "decline", now?): Promise<{ status: BookingStatus }>`
  - `interface StudentBooking { id: string; status: BookingStatus; requestMessage: string; createdAt: Date; meal: { id: string; title: string; startsAt: Date; neighborhood: string; hostFirstName: string; status: MealStatus; address: string | null } }`
  - `listStudentBookings(db, actor): Promise<StudentBooking[]>`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/bookings.test.ts` :

```ts
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings } from "@/db/schema";
import { decideBooking, listStudentBookings, requestBooking } from "@/server/bookings/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("requestBooking", () => {
  it("crée une demande en attente pour un étudiant vérifié", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const { id } = await requestBooking(db, student, meal.id, { message: "Bonjour, avec plaisir !" });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row).toMatchObject({ status: "pending", requestMessage: "Bonjour, avec plaisir !" });
  });

  it("refuse un étudiant non vérifié, un repas passé, un repas complet, un id invalide", async () => {
    const host = await makeProfile({ role: "host" });
    const unverified = await makeProfile({ verificationStatus: "none" });
    const student = await makeProfile();
    const other = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const past = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    await expect(requestBooking(db, unverified, meal.id, {})).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await expect(requestBooking(db, student, past.id, {})).rejects.toMatchObject({ code: "MEAL_STARTED" });
    await makeBooking(meal.id, other.userId, "accepted");
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "MEAL_FULL" });
    await expect(requestBooking(db, student, "abc", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuse une deuxième demande, y compris en double-clic simultané", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const results = await Promise.allSettled([
      requestBooking(db, student, meal.id, {}),
      requestBooking(db, student, meal.id, {}),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ALREADY_REQUESTED" });
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });
  });

  it("refuse un message trop long", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    await expect(requestBooking(db, student, meal.id, { message: "x".repeat(501) })).rejects.toThrow();
  });
});

describe("decideBooking", () => {
  it("permet à l'hôte d'accepter puis interdit une seconde décision", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId);
    expect(await decideBooking(db, host, booking.id, "accept")).toEqual({ status: "accepted" });
    await expect(decideBooking(db, host, booking.id, "decline")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("refuse un autre hôte", async () => {
    const host = await makeProfile({ role: "host" });
    const intruder = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId);
    await expect(decideBooking(db, intruder, booking.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("n'accepte jamais plus d'étudiants que de places, même en simultané", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const b1 = await makeBooking(meal.id, s1.userId);
    const b2 = await makeBooking(meal.id, s2.userId);
    const results = await Promise.allSettled([
      decideBooking(db, host, b1.id, "accept"),
      decideBooking(db, host, b2.id, "accept"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "MEAL_FULL" });
    const accepted = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.mealId, meal.id), eq(bookings.status, "accepted")));
    expect(accepted).toHaveLength(1);
  });
});

describe("listStudentBookings", () => {
  it("donne l'adresse uniquement pour les réservations acceptées", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile();
    const m1 = await makeMeal(host.userId, { title: "Accepté" });
    const m2 = await makeMeal(host.userId, { title: "En attente" });
    await makeBooking(m1.id, student.userId, "accepted");
    await makeBooking(m2.id, student.userId, "pending");
    const list = await listStudentBookings(db, student);
    const byTitle = Object.fromEntries(list.map((b) => [b.meal.title, b]));
    expect(byTitle["Accepté"].meal.address).toBe("12 rue Notre-Dame, 33000 Bordeaux");
    expect(byTitle["En attente"].meal.address).toBeNull();
    expect(byTitle["Accepté"].meal.hostFirstName).toBe("Mireille");
  });
});
```

Run: `npm run test:integration -- tests/integration/bookings.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter le service**

`src/server/bookings/service.ts` :

```ts
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import { assertCanDecide, assertCanRequest, canSeeAddress, type Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import type { BookingStatus, MealStatus } from "@/domain/types";
import { countAccepted } from "@/server/meals/service";

const requestSchema = z.object({
  message: z.string().trim().max(500, "500 caractères maximum").default(""),
});

export interface StudentBooking {
  id: string;
  status: BookingStatus;
  requestMessage: string;
  createdAt: Date;
  meal: {
    id: string;
    title: string;
    startsAt: Date;
    neighborhood: string;
    hostFirstName: string;
    status: MealStatus;
    address: string | null;
  };
}

export async function requestBooking(
  db: Db,
  actor: Actor,
  mealId: string,
  raw: { message?: unknown },
  now = new Date(),
): Promise<{ id: string }> {
  const { message } = requestSchema.parse(raw);
  if (!isUuid(mealId)) throw new DomainError("NOT_FOUND");
  return db.transaction(async (tx) => {
    // Le verrou sur le repas sérialise les demandes et les acceptations concurrentes.
    const [meal] = await tx.select().from(meals).where(eq(meals.id, mealId)).for("update");
    if (!meal) throw new DomainError("NOT_FOUND");
    const [existing] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.mealId, mealId), eq(bookings.studentId, actor.userId)))
      .limit(1);
    const acceptedCount = await countAccepted(tx, mealId);
    assertCanRequest({ actor, meal, acceptedCount, alreadyRequested: Boolean(existing), now });
    const [row] = await tx
      .insert(bookings)
      .values({ mealId, studentId: actor.userId, requestMessage: message })
      .returning({ id: bookings.id });
    return row;
  });
}

export async function decideBooking(
  db: Db,
  actor: Actor,
  bookingId: string,
  decision: "accept" | "decline",
  now = new Date(),
): Promise<{ status: BookingStatus }> {
  if (!isUuid(bookingId)) throw new DomainError("NOT_FOUND");
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!booking) throw new DomainError("NOT_FOUND");
    const [meal] = await tx.select().from(meals).where(eq(meals.id, booking.mealId)).for("update");
    // Relire la réservation après le verrou : une autre décision a pu passer entre-temps.
    const [fresh] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    const acceptedCount = await countAccepted(tx, meal.id);
    assertCanDecide({ actor, meal, bookingStatus: fresh.status, acceptedCount, decision, now });
    const status: BookingStatus = decision === "accept" ? "accepted" : "declined";
    await tx.update(bookings).set({ status }).where(eq(bookings.id, bookingId));
    return { status };
  });
}

export async function listStudentBookings(db: Db, actor: Actor): Promise<StudentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      createdAt: bookings.createdAt,
      mealId: meals.id,
      title: meals.title,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      mealStatus: meals.status,
      address: meals.address,
      hostId: meals.hostId,
      hostFirstName: profiles.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(eq(bookings.studentId, actor.userId))
    .orderBy(desc(meals.startsAt));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    requestMessage: r.requestMessage,
    createdAt: r.createdAt,
    meal: {
      id: r.mealId,
      title: r.title,
      startsAt: r.startsAt,
      neighborhood: r.neighborhood,
      hostFirstName: r.hostFirstName,
      status: r.mealStatus,
      address: canSeeAddress({ viewerId: actor.userId, hostId: r.hostId, viewerBookingStatus: r.status }) ? r.address : null,
    },
  }));
}
```

- [ ] **Step 3: Lancer toute la suite d'intégration**

Run: `npm run test:integration`
Expected: PASS (schéma, profils, repas, réservations).

- [ ] **Step 4: Commit**

```bash
git add src/server/bookings/service.ts tests/integration/bookings.test.ts
git commit -m "feat: service des réservations (demande, décision de l'hôte, mes repas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Actions serveur et écrans de l'hôte

**Files:**
- Create: `src/server/meals/actions.ts`, `src/server/bookings/actions.ts`
- Create: `src/components/meal-form.tsx`, `src/components/decision-buttons.tsx`, `src/components/diet-badges.tsx`, `src/components/booking-status-badge.tsx`
- Create: `src/app/hote/offres/page.tsx`, `src/app/hote/offres/nouvelle/page.tsx`, `src/app/hote/offres/[id]/modifier/page.tsx`

**Interfaces:**
- Consumes: `createMeal`, `updateMeal`, `listHostMeals`, `getHostMeal` (Task 7) ; `requestBooking`, `decideBooking` (Task 8) ; `requireProfile`, `FormState`, `formValues`, `toFormState`, composants UI (Task 6) ; `formatMealDate`, `dateToParisLocal` (Task 3) ; `DIET_TAGS`, `NEIGHBORHOODS` (Task 3).
- Produces:
  - `createMealAction(prev: FormState, fd: FormData): Promise<FormState>`
  - `updateMealAction(mealId: string, prev: FormState, fd: FormData): Promise<FormState>`
  - `requestBookingAction(mealId: string, prev: FormState, fd: FormData): Promise<FormState>`
  - `decideBookingAction(bookingId: string, decision: "accept" | "decline", prev: FormState, fd: FormData): Promise<FormState>`
  - `<MealForm action defaults? submitLabel />`, `<DietBadges tags />`, `<BookingStatusBadge status />`, `<DecisionButtons bookingId />`

- [ ] **Step 1: Actions serveur**

`src/server/meals/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { createMeal, updateMeal } from "./service";

export async function createMealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd, ["dietTags"]);
  try {
    await createMeal(getDb(), actor, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  redirect("/hote/offres");
}

export async function updateMealAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd, ["dietTags"]);
  try {
    await updateMeal(getDb(), actor, mealId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  revalidatePath(`/repas/${mealId}`);
  redirect("/hote/offres");
}
```

`src/server/bookings/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { decideBooking, requestBooking } from "./service";

export async function requestBookingAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = formValues(fd);
  try {
    await requestBooking(getDb(), actor, mealId, { message: values.message ?? "" });
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath(`/repas/${mealId}`);
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  return { ok: true };
}

export async function decideBookingAction(
  bookingId: string,
  decision: "accept" | "decline",
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("host");
  try {
    await decideBooking(getDb(), actor, bookingId, decision);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/repas");
  return { ok: true };
}
```

- [ ] **Step 2: Petits composants d'affichage**

`src/components/diet-badges.tsx` :

```tsx
import { DIET_TAGS, type DietTag } from "@/config/diet-tags";
import { Badge } from "@/components/ui";

export function DietBadges({ tags }: { tags: DietTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} tone="green">{DIET_TAGS[tag]}</Badge>
      ))}
    </div>
  );
}
```

`src/components/booking-status-badge.tsx` :

```tsx
import type { BookingStatus } from "@/domain/types";
import { Badge, type BadgeTone } from "@/components/ui";

const LABELS: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "En attente", tone: "amber" },
  accepted: { label: "Acceptée", tone: "green" },
  declined: { label: "Refusée", tone: "red" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
```

- [ ] **Step 3: Formulaire de repas**

`src/components/meal-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { DIET_TAGS, DIET_TAG_KEYS, type DietTag } from "@/config/diet-tags";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import type { FormState } from "@/server/form-state";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export interface MealFormDefaults {
  title: string;
  description: string;
  startsAtLocal: string;
  neighborhood: string;
  address: string;
  seatsTotal: number;
  dietTags: DietTag[];
  allergens: string;
}

export function MealForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  defaults?: MealFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const text = (key: keyof MealFormDefaults) => (v ? String(v[key] ?? "") : String(defaults?.[key] ?? ""));
  const checkedTags = v ? ((v.dietTags as string[]) ?? []) : (defaults?.dietTags ?? []);

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="space-y-1.5">
        <Label htmlFor="title">Plat proposé</Label>
        <Input id="title" name="title" defaultValue={text("title")} placeholder="Ex. : Blanquette de veau" required maxLength={80} />
        <FieldError errors={fe.title} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={text("description")} placeholder="Ce que vous cuisinez, l'ambiance à table…" required maxLength={1000} />
        <FieldError errors={fe.description} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startsAtLocal">Date et heure du repas</Label>
        <Input id="startsAtLocal" name="startsAtLocal" type="datetime-local" defaultValue={text("startsAtLocal")} required />
        <FieldError errors={fe.startsAtLocal} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="neighborhood">Quartier (visible par tous)</Label>
          <Select id="neighborhood" name="neighborhood" defaultValue={text("neighborhood")} required>
            <option value="">Choisir…</option>
            {NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
          <FieldError errors={fe.neighborhood} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seatsTotal">Nombre de places</Label>
          <Input id="seatsTotal" name="seatsTotal" type="number" min={1} max={6} defaultValue={text("seatsTotal") || "1"} required />
          <FieldError errors={fe.seatsTotal} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Adresse exacte</Label>
        <Input id="address" name="address" defaultValue={text("address")} autoComplete="street-address" required maxLength={200} />
        <p className="text-xs text-stone-500">Communiquée uniquement aux étudiants que vous acceptez.</p>
        <FieldError errors={fe.address} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Régimes compatibles</legend>
        <div className="flex flex-wrap gap-2">
          {DIET_TAG_KEYS.map((tag) => (
            <label key={tag} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm">
              <input type="checkbox" name="dietTags" value={tag} defaultChecked={checkedTags.includes(tag)} />
              {DIET_TAGS[tag]}
            </label>
          ))}
        </div>
        <FieldError errors={fe.dietTags} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="allergens">Allergènes (facultatif)</Label>
        <Input id="allergens" name="allergens" defaultValue={text("allergens")} placeholder="Ex. : fruits à coque, œufs" maxLength={200} />
        <FieldError errors={fe.allergens} />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Boutons accepter / refuser**

`src/components/decision-buttons.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { decideBookingAction } from "@/server/bookings/actions";
import { Button } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function DecisionButtons({ bookingId }: { bookingId: string }) {
  const [acceptState, accept, accepting] = useActionState(decideBookingAction.bind(null, bookingId, "accept"), {});
  const [declineState, decline, declining] = useActionState(decideBookingAction.bind(null, bookingId, "decline"), {});
  const pending = accepting || declining;
  return (
    <div className="space-y-2">
      <FormError message={acceptState.error ?? declineState.error} />
      <div className="flex gap-2">
        <form action={accept}>
          <Button type="submit" disabled={pending}>Accepter</Button>
        </form>
        <form action={decline}>
          <Button type="submit" variant="secondary" disabled={pending}>Refuser</Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Pages de l'hôte**

`src/app/hote/offres/page.tsx` :

```tsx
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { DecisionButtons } from "@/components/decision-buttons";
import { DietBadges } from "@/components/diet-badges";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { listHostMeals } from "@/server/meals/service";
import { requireProfile } from "@/server/session";

export default async function HostMealsPage() {
  const actor = await requireProfile("host");
  const list = await listHostMeals(getDb(), actor);
  const now = Date.now();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mes repas proposés</h1>
        <LinkButton href="/hote/offres/nouvelle">Proposer un repas</LinkButton>
      </div>

      {list.length === 0 && (
        <Card>
          <p className="text-stone-600">Vous n'avez pas encore proposé de repas. Une portion de plus suffit pour commencer !</p>
        </Card>
      )}

      {list.map((meal) => {
        const upcoming = meal.startsAt.getTime() > now && meal.status === "open";
        return (
          <Card key={meal.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{meal.title}</h2>
                <p className="text-sm text-stone-600">
                  {formatMealDate(meal.startsAt)} · {meal.neighborhood}
                </p>
                <p className="text-sm text-stone-500">{meal.address}</p>
              </div>
              {meal.status === "cancelled" ? (
                <Badge tone="neutral">Annulé</Badge>
              ) : upcoming ? (
                <Badge tone="orange">{meal.seatsLeft} place(s) libre(s) sur {meal.seatsTotal}</Badge>
              ) : (
                <Badge tone="neutral">Passé</Badge>
              )}
            </div>
            <DietBadges tags={meal.dietTags} />
            {upcoming && (
              <LinkButton href={`/hote/offres/${meal.id}/modifier`} variant="secondary">Modifier</LinkButton>
            )}

            <div className="space-y-2 border-t border-stone-100 pt-3">
              <h3 className="text-sm font-semibold text-stone-700">Demandes ({meal.requests.length})</h3>
              {meal.requests.length === 0 && <p className="text-sm text-stone-500">Aucune demande pour l'instant.</p>}
              {meal.requests.map((r) => (
                <div key={r.id} className="space-y-2 rounded-lg bg-stone-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.studentFirstName}</span>
                    {r.studentSchool && <span className="text-sm text-stone-600">· {r.studentSchool}</span>}
                    {r.studentVerified && <Badge tone="green">Étudiant vérifié</Badge>}
                    <BookingStatusBadge status={r.status} />
                  </div>
                  {r.requestMessage && <p className="text-sm text-stone-700">« {r.requestMessage} »</p>}
                  {r.status === "pending" && upcoming && <DecisionButtons bookingId={r.id} />}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </main>
  );
}
```

`src/app/hote/offres/nouvelle/page.tsx` :

```tsx
import { MealForm } from "@/components/meal-form";
import { createMealAction } from "@/server/meals/actions";
import { requireProfile } from "@/server/session";

export default async function NewMealPage() {
  await requireProfile("host");
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Proposer un repas</h1>
      <MealForm action={createMealAction} submitLabel="Publier le repas" />
    </main>
  );
}
```

`src/app/hote/offres/[id]/modifier/page.tsx` :

```tsx
import { notFound } from "next/navigation";
import { MealForm } from "@/components/meal-form";
import { getDb } from "@/db/client";
import { dateToParisLocal } from "@/domain/dates";
import { updateMealAction } from "@/server/meals/actions";
import { getHostMeal } from "@/server/meals/service";
import { requireProfile } from "@/server/session";

export default async function EditMealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile("host");
  const meal = await getHostMeal(getDb(), actor, id);
  if (!meal) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Modifier le repas</h1>
      <MealForm
        action={updateMealAction.bind(null, meal.id)}
        submitLabel="Enregistrer"
        defaults={{
          title: meal.title,
          description: meal.description,
          startsAtLocal: dateToParisLocal(meal.startsAt),
          neighborhood: meal.neighborhood,
          address: meal.address,
          seatsTotal: meal.seatsTotal,
          dietTags: meal.dietTags,
          allergens: meal.allergens,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 6: Vérifier**

Run: `npm run lint && npm run build`
Expected: aucune erreur de type ni de lint.

Vérification manuelle (`npm run dev`) : créer un compte hôte de test, publier un repas avec une date passée (le message « La date doit être dans le futur » s'affiche et les champs restent remplis), puis un repas valide (il apparaît dans « Mes repas proposés »), puis le modifier. Supprimer ensuite ce compte comme en Task 6, étape 8.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: écrans hôte (publier, modifier, accepter ou refuser les demandes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Écrans de l'étudiant

**Files:**
- Create: `src/components/meal-card.tsx`, `src/components/meal-filters.tsx`, `src/components/request-form.tsx`
- Create: `src/app/repas/page.tsx`, `src/app/repas/[id]/page.tsx`, `src/app/repas/[id]/not-found.tsx`, `src/app/etudiant/mes-repas/page.tsx`

**Interfaces:**
- Consumes: `listUpcomingMeals`, `getMealForViewer`, `PublicMeal` (Task 7) ; `listStudentBookings` (Task 8) ; `requestBookingAction` (Task 9) ; `getCurrentProfile`, `requireProfile` (Task 6) ; `DietBadges`, `BookingStatusBadge` (Task 9).
- Produces: les routes publiques `/repas` et `/repas/[id]`, et la route protégée `/etudiant/mes-repas`.

- [ ] **Step 1: Carte de repas et filtres**

`src/components/meal-card.tsx` :

```tsx
import Link from "next/link";
import { DietBadges } from "@/components/diet-badges";
import { Badge, Card } from "@/components/ui";
import { formatMealDate } from "@/domain/dates";
import type { PublicMeal } from "@/server/meals/service";

export function MealCard({ meal }: { meal: PublicMeal }) {
  return (
    <Link href={`/repas/${meal.id}`} className="block">
      <Card className="space-y-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{meal.title}</h2>
          {meal.seatsLeft === 0 ? <Badge tone="neutral">Complet</Badge> : <Badge tone="orange">{meal.seatsLeft} place(s)</Badge>}
        </div>
        <p className="text-sm text-stone-600">
          {formatMealDate(meal.startsAt)} · {meal.neighborhood} · chez {meal.hostFirstName}
        </p>
        <DietBadges tags={meal.dietTags} />
      </Card>
    </Link>
  );
}
```

`src/components/meal-filters.tsx` :

```tsx
import Link from "next/link";
import { DIET_TAGS, DIET_TAG_KEYS } from "@/config/diet-tags";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { Button, Input, Label, Select } from "@/components/ui";

export function MealFilters({ quartier, regime, jour }: { quartier?: string; regime?: string; jour?: string }) {
  return (
    <form method="get" className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4 sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="quartier">Quartier</Label>
        <Select id="quartier" name="quartier" defaultValue={quartier ?? ""}>
          <option value="">Tous</option>
          {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="regime">Régime</Label>
        <Select id="regime" name="regime" defaultValue={regime ?? ""}>
          <option value="">Tous</option>
          {DIET_TAG_KEYS.map((t) => <option key={t} value={t}>{DIET_TAGS[t]}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="jour">Jour</Label>
        <Input id="jour" name="jour" type="date" defaultValue={jour ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Filtrer</Button>
        <Link href="/repas" className="self-center text-sm text-stone-600 underline">Effacer</Link>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Liste des repas**

`src/app/repas/page.tsx` :

```tsx
import { MealCard } from "@/components/meal-card";
import { MealFilters } from "@/components/meal-filters";
import { getDb } from "@/db/client";
import { listUpcomingMeals } from "@/server/meals/service";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function MealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = { quartier: first(sp.quartier), regime: first(sp.regime), jour: first(sp.jour) };
  const list = await listUpcomingMeals(getDb(), {
    neighborhood: filters.quartier,
    dietTag: filters.regime,
    day: filters.jour,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Repas partagés à Bordeaux</h1>
      <MealFilters {...filters} />
      {list.length === 0 ? (
        <p className="text-stone-600">Aucun repas ne correspond pour le moment. Revenez bientôt !</p>
      ) : (
        <div className="space-y-3">
          {list.map((meal) => <MealCard key={meal.id} meal={meal} />)}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Formulaire de demande**

`src/components/request-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { requestBookingAction } from "@/server/bookings/actions";
import { Button, Label, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function RequestForm({ mealId, hostFirstName }: { mealId: string; hostFirstName: string }) {
  const [state, action, pending] = useActionState(requestBookingAction.bind(null, mealId), {});
  if (state.ok) {
    return <p className="rounded-lg bg-green-50 p-3 text-green-800">Demande envoyée ! {hostFirstName} va vous répondre.</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <FormError message={state.error} />
      <div className="space-y-1.5">
        <Label htmlFor="message">Un petit mot pour {hostFirstName} (facultatif)</Label>
        <Textarea id="message" name="message" maxLength={500} defaultValue={(state.values?.message as string) ?? ""} placeholder="Présentez-vous en quelques mots…" />
        <FieldError errors={state.fieldErrors?.message} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Demander à partager ce repas"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Fiche repas**

`src/app/repas/[id]/page.tsx` :

```tsx
import { notFound } from "next/navigation";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { DietBadges } from "@/components/diet-badges";
import { RequestForm } from "@/components/request-form";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { getMealForViewer } from "@/server/meals/service";
import { getCurrentProfile } from "@/server/session";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentProfile();
  const meal = await getMealForViewer(getDb(), viewer, id);
  if (!meal) notFound();

  const isHost = viewer?.userId === meal.hostId;
  const open = meal.status === "open" && meal.startsAt.getTime() > Date.now();

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">{meal.title}</h1>
          {meal.status === "cancelled" ? <Badge>Annulé</Badge> : meal.seatsLeft === 0 ? <Badge>Complet</Badge> : <Badge tone="orange">{meal.seatsLeft} place(s)</Badge>}
        </div>
        <p className="text-stone-600">{formatMealDate(meal.startsAt)} · {meal.neighborhood} · chez {meal.hostFirstName}</p>
        <p className="whitespace-pre-line">{meal.description}</p>
        <DietBadges tags={meal.dietTags} />
        {meal.allergens && <p className="text-sm text-stone-600">Allergènes : {meal.allergens}</p>}
        {meal.address ? (
          <p className="rounded-lg bg-green-50 p-3 text-green-900"><strong>Adresse :</strong> {meal.address}</p>
        ) : (
          <p className="text-sm text-stone-500">L'adresse exacte est communiquée une fois votre demande acceptée.</p>
        )}
      </Card>

      <Card>
        {isHost ? (
          <div className="space-y-2">
            <p>C'est votre repas.</p>
            <LinkButton href="/hote/offres" variant="secondary">Gérer mes repas</LinkButton>
          </div>
        ) : !viewer ? (
          <div className="space-y-2">
            <p>Vous êtes étudiant·e ? Créez un compte pour demander à partager ce repas.</p>
            <LinkButton href="/inscription">Créer un compte</LinkButton>
          </div>
        ) : viewer.role !== "student" ? (
          <p className="text-stone-600">Seuls les étudiants peuvent demander à partager un repas.</p>
        ) : meal.viewerBooking ? (
          <div className="flex items-center gap-2">
            <span>Votre demande :</span>
            <BookingStatusBadge status={meal.viewerBooking.status} />
          </div>
        ) : !open ? (
          <p className="text-stone-600">Ce repas n'accepte plus de demandes.</p>
        ) : viewer.verificationStatus !== "verified" ? (
          <p className="text-stone-600">Votre statut étudiant doit être vérifié avant de demander un repas. La vérification arrive très bientôt sur Ocleans.</p>
        ) : meal.seatsLeft === 0 ? (
          <p className="text-stone-600">Ce repas est complet.</p>
        ) : (
          <RequestForm mealId={meal.id} hostFirstName={meal.hostFirstName} />
        )}
      </Card>
    </main>
  );
}
```

`src/app/repas/[id]/not-found.tsx` :

```tsx
import { LinkButton } from "@/components/ui";

export default function MealNotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Repas introuvable</h1>
      <p className="text-stone-600">Ce repas n'existe pas ou n'est plus disponible.</p>
      <LinkButton href="/repas">Voir les repas</LinkButton>
    </main>
  );
}
```

- [ ] **Step 5: Mes repas (étudiant)**

`src/app/etudiant/mes-repas/page.tsx` :

```tsx
import Link from "next/link";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { listStudentBookings } from "@/server/bookings/service";
import { requireProfile } from "@/server/session";

export default async function StudentMealsPage() {
  const actor = await requireProfile("student");
  const list = await listStudentBookings(getDb(), actor);
  const now = Date.now();
  const upcoming = list.filter((b) => b.meal.startsAt.getTime() > now);
  const past = list.filter((b) => b.meal.startsAt.getTime() <= now);

  const section = (title: string, items: typeof list) => (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {items.length === 0 && <p className="text-sm text-stone-500">Rien pour l'instant.</p>}
      {items.map((b) => (
        <Card key={b.id} className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/repas/${b.meal.id}`} className="font-semibold underline-offset-2 hover:underline">{b.meal.title}</Link>
            <BookingStatusBadge status={b.status} />
          </div>
          <p className="text-sm text-stone-600">{formatMealDate(b.meal.startsAt)} · {b.meal.neighborhood} · chez {b.meal.hostFirstName}</p>
          {b.meal.address && <p className="text-sm text-green-900"><strong>Adresse :</strong> {b.meal.address}</p>}
        </Card>
      ))}
    </section>
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Mes repas</h1>
        <LinkButton href="/repas" variant="secondary">Trouver un repas</LinkButton>
      </div>
      {section("À venir", upcoming)}
      {section("Passés", past)}
    </main>
  );
}
```

- [ ] **Step 6: Vérifier**

Run: `npm run lint && npm run build`
Expected: aucune erreur.

Vérifications manuelles : `/repas/abc` affiche « Repas introuvable », `/repas?quartier=Paris&regime=pizza&jour=demain` affiche la liste sans erreur.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: écrans étudiant (liste filtrée, fiche repas, demande, mes repas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Accueil, navigation, mode démo et données de démo

**Files:**
- Create: `src/lib/demo.ts`, `src/components/site-header.tsx`, `src/components/sign-out-button.tsx`, `src/components/quick-login.tsx`, `src/components/demo-banner.tsx`, `scripts/seed-demo.ts`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/connexion/page.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 6) ; `authClient` (Task 6) ; `createDb`, tables (Task 5) ; `parisLocalToDate`, `dateToParisLocal`, `nextDay` (Task 3).
- Produces: `DEMO_ACCOUNTS: readonly { email: string; label: string }[]`, `isDemoMode(): boolean` ; la commande `npm run seed:demo`.

- [ ] **Step 1: Configuration de la démo**

`src/lib/demo.ts` :

```ts
export const DEMO_ACCOUNTS = [
  { email: "mireille.demo@example.com", label: "Mireille — hôte aux Chartrons" },
  { email: "lea.demo@example.com", label: "Léa — étudiante vérifiée" },
  { email: "admin.demo@example.com", label: "Admin Ocleans" },
] as const;

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
```

- [ ] **Step 2: En-tête, déconnexion, bandeau démo**

`src/components/sign-out-button.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-stone-600 underline-offset-2 hover:underline"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Déconnexion
    </button>
  );
}
```

`src/components/site-header.tsx` :

```tsx
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentProfile } from "@/server/session";

export async function SiteHeader() {
  const profile = await getCurrentProfile();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-orange-700">Ocleans</Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/repas">Repas</Link>
          {profile?.role === "student" && <Link href="/etudiant/mes-repas">Mes repas</Link>}
          {profile?.role === "host" && <Link href="/hote/offres">Mes offres</Link>}
          {profile ? (
            <>
              <span className="text-stone-500">{profile.firstName}</span>
              <SignOutButton />
            </>
          ) : (
            <Link href="/connexion" className="font-medium text-orange-700">Connexion</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
```

`src/components/demo-banner.tsx` :

```tsx
export function DemoBanner() {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
      Version de démonstration : données fictives, aucun email n'est envoyé.
    </div>
  );
}
```

`src/app/layout.tsx` (remplacer tout le contenu) :

```tsx
import type { Metadata, Viewport } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { isDemoMode } from "@/lib/demo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ocleans — Repas partagés entre habitants et étudiants",
  description: "Partagez un repas avec un étudiant à Bordeaux.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        {isDemoMode() && <DemoBanner />}
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Accueil**

`src/app/page.tsx` (remplacer tout le contenu) :

```tsx
import { Card, LinkButton } from "@/components/ui";

const STEPS = [
  { title: "Une portion de plus", text: "Un habitant cuisine un peu plus que prévu et propose une place à sa table." },
  { title: "Une demande", text: "Un étudiant vérifié choisit un repas près de chez lui et se présente en quelques mots." },
  { title: "Un moment partagé", text: "L'hôte accepte, l'adresse est communiquée, et on se retrouve autour de la table." },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4 pt-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold leading-tight">Un repas partagé, un lien qui se crée.</h1>
        <p className="text-lg text-stone-700">
          À Bordeaux, des habitants cuisinent une portion de plus pour accueillir un étudiant à leur table.
          Gratuit, simple et chaleureux.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/repas" className="sm:flex-1">Je suis étudiant·e</LinkButton>
          <LinkButton href="/inscription" variant="secondary" className="sm:flex-1">Je propose un repas</LinkButton>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="space-y-1">
            <p className="text-sm font-semibold text-orange-700">{i + 1}.</p>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-sm text-stone-600">{s.text}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Connexion rapide de démo**

`src/components/quick-login.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button, Card } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function QuickLogin({ accounts, password }: { accounts: readonly { email: string; label: string }[]; password: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function login(email: string) {
    setPending(email);
    setError(undefined);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(null);
    if (error) {
      setError("Connexion de démo impossible. Les données de démo ont-elles été créées (npm run seed:demo) ?");
      return;
    }
    router.push("/bienvenue");
    router.refresh();
  }

  return (
    <Card className="space-y-3 border-amber-300 bg-amber-50">
      <h2 className="font-semibold text-amber-900">Démo : connexion en un clic</h2>
      <FormError message={error} />
      <div className="flex flex-col gap-2">
        {accounts.map((a) => (
          <Button key={a.email} type="button" variant="secondary" disabled={pending !== null} onClick={() => login(a.email)}>
            {pending === a.email ? "Connexion…" : a.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}
```

`src/app/connexion/page.tsx` (remplacer tout le contenu) :

```tsx
import { SignInForm } from "@/components/auth-forms";
import { QuickLogin } from "@/components/quick-login";
import { DEMO_ACCOUNTS, isDemoMode } from "@/lib/demo";

export default function SignInPage() {
  const demoPassword = process.env.DEMO_PASSWORD;
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Se connecter</h1>
      {isDemoMode() && demoPassword && <QuickLogin accounts={DEMO_ACCOUNTS} password={demoPassword} />}
      <SignInForm />
    </main>
  );
}
```

Le compte admin redirige vers `/repas` (via `homeFor`) tant que l'écran admin n'existe pas (Plan 2).

- [ ] **Step 5: Vérifier le nom de la table des utilisateurs Neon Auth**

Avec `run_sql` sur la branche `demo` :

```sql
select table_name from information_schema.tables where table_schema = 'neon_auth';
```

Expected: une table `user` (avec les colonnes `id` et `email`). Si le nom diffère, adapter la requête de `findAuthUserId` à l'étape suivante.

- [ ] **Step 6: Script de données de démo**

`scripts/seed-demo.ts` :

```ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray, sql } from "drizzle-orm";
import type { DietTag } from "../src/config/diet-tags";
import { createDb } from "../src/db/client";
import { bookings, meals, profiles } from "../src/db/schema";
import { dateToParisLocal, nextDay, parisLocalToDate } from "../src/domain/dates";
import type { BookingStatus, Role, VerificationStatus } from "../src/domain/types";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant dans .env.local`);
  return value;
}

const db = createDb(env("DATABASE_URL"));
const authBaseUrl = env("NEON_AUTH_BASE_URL").replace(/\/$/, "");
const password = env("DEMO_PASSWORD");
const origin = process.env.SEED_ORIGIN ?? "http://localhost:3000";

interface Person {
  key: string;
  email: string;
  firstName: string;
  role: Role;
  school?: string;
  verificationStatus?: VerificationStatus;
}

const PEOPLE: Person[] = [
  { key: "mireille", email: "mireille.demo@example.com", firstName: "Mireille", role: "host" },
  { key: "dupuy", email: "dupuy.demo@example.com", firstName: "Famille Dupuy", role: "host" },
  { key: "jeanpierre", email: "jeanpierre.demo@example.com", firstName: "Jean-Pierre", role: "host" },
  { key: "samira", email: "samira.demo@example.com", firstName: "Samira", role: "host" },
  { key: "helene", email: "helene.demo@example.com", firstName: "Hélène", role: "host" },
  { key: "lea", email: "lea.demo@example.com", firstName: "Léa", role: "student", school: "Université de Bordeaux", verificationStatus: "verified" },
  { key: "karim", email: "karim.demo@example.com", firstName: "Karim", role: "student", school: "Bordeaux INP", verificationStatus: "verified" },
  { key: "chloe", email: "chloe.demo@example.com", firstName: "Chloé", role: "student", school: "Université Bordeaux Montaigne", verificationStatus: "none" },
  { key: "admin", email: "admin.demo@example.com", firstName: "Admin", role: "admin" },
];

interface MealSeed {
  key: string;
  host: string;
  days: number;
  time: string;
  title: string;
  description: string;
  neighborhood: string;
  address: string;
  seats: number;
  dietTags: DietTag[];
  allergens?: string;
}

const MEALS: MealSeed[] = [
  { key: "blanquette", host: "mireille", days: 2, time: "19:30", title: "Blanquette de veau", description: "La recette de ma mère, avec du riz et une tarte aux pommes pour finir. J'adore parler voyages !", neighborhood: "Chartrons", address: "18 rue Notre-Dame, 33000 Bordeaux", seats: 2, dietTags: ["sans_porc"] },
  { key: "soupe", host: "mireille", days: 6, time: "12:30", title: "Soupe au pistou et fromages", description: "Déjeuner tranquille, légumes du marché des Chartrons.", neighborhood: "Chartrons", address: "18 rue Notre-Dame, 33000 Bordeaux", seats: 1, dietTags: ["vegetarien"], allergens: "Lait" },
  { key: "lasagnes", host: "dupuy", days: 4, time: "19:00", title: "Lasagnes maison", description: "Repas en famille avec nos deux enfants, ambiance animée garantie !", neighborhood: "Bastide", address: "7 rue de Nuits, 33100 Bordeaux", seats: 2, dietTags: [], allergens: "Gluten, lait" },
  { key: "couscous", host: "dupuy", days: 9, time: "19:30", title: "Couscous aux légumes", description: "Grand couscous du dimanche soir, on cuisine toujours trop !", neighborhood: "Bastide", address: "7 rue de Nuits, 33100 Bordeaux", seats: 3, dietTags: ["vegetarien", "vegan"] },
  { key: "garbure", host: "jeanpierre", days: 3, time: "12:00", title: "Garbure landaise", description: "Ancien cuisinier, je partage volontiers mes recettes du Sud-Ouest.", neighborhood: "Caudéran", address: "42 avenue Louis Barthou, 33200 Bordeaux", seats: 2, dietTags: [] },
  { key: "omelette", host: "jeanpierre", days: 8, time: "19:00", title: "Omelette aux cèpes", description: "Cèpes ramassés par mes soins, salade du jardin.", neighborhood: "Caudéran", address: "42 avenue Louis Barthou, 33200 Bordeaux", seats: 1, dietTags: ["vegetarien", "sans_gluten"], allergens: "Œufs" },
  { key: "tajine", host: "samira", days: 3, time: "20:00", title: "Tajine poulet citron", description: "Un tajine parfumé et du thé à la menthe. Bienvenue à la maison !", neighborhood: "Saint-Michel", address: "5 rue des Faures, 33000 Bordeaux", seats: 2, dietTags: ["halal", "sans_porc"] },
  { key: "harira", host: "samira", days: 10, time: "19:30", title: "Harira et msemen", description: "Soupe traditionnelle et crêpes feuilletées.", neighborhood: "Saint-Michel", address: "5 rue des Faures, 33000 Bordeaux", seats: 3, dietTags: ["halal", "sans_porc"], allergens: "Gluten" },
  { key: "gratin", host: "helene", days: 5, time: "19:00", title: "Gratin dauphinois et salade", description: "Retraitée et ancienne prof de lettres, j'aime les bonnes discussions.", neighborhood: "Talence", address: "11 rue Camille Pelletan, 33400 Talence", seats: 2, dietTags: ["vegetarien", "sans_gluten"], allergens: "Lait" },
  { key: "curry", host: "helene", days: 12, time: "12:30", title: "Curry de lentilles corail", description: "Déjeuner doux et épicé, idéal entre deux partiels.", neighborhood: "Talence", address: "11 rue Camille Pelletan, 33400 Talence", seats: 2, dietTags: ["vegan", "sans_gluten", "sans_lactose"] },
  { key: "poulet", host: "mireille", days: 13, time: "12:30", title: "Poulet rôti du dimanche", description: "Poulet fermier, pommes de terre au four.", neighborhood: "Chartrons", address: "18 rue Notre-Dame, 33000 Bordeaux", seats: 3, dietTags: ["sans_gluten"] },
  { key: "risotto", host: "dupuy", days: 1, time: "19:30", title: "Risotto aux champignons", description: "Soirée simple en semaine, on vous attend !", neighborhood: "Bastide", address: "7 rue de Nuits, 33100 Bordeaux", seats: 1, dietTags: ["vegetarien", "sans_gluten"], allergens: "Lait" },
  { key: "pasta", host: "samira", days: 7, time: "12:00", title: "Pâtes au pesto maison", description: "Déjeuner rapide et convivial près de la basilique.", neighborhood: "Saint-Michel", address: "5 rue des Faures, 33000 Bordeaux", seats: 2, dietTags: ["vegetarien"], allergens: "Gluten, fruits à coque" },
  { key: "passe1", host: "mireille", days: -3, time: "19:30", title: "Pot-au-feu", description: "Un classique pour les soirées fraîches.", neighborhood: "Chartrons", address: "18 rue Notre-Dame, 33000 Bordeaux", seats: 2, dietTags: ["sans_porc"] },
  { key: "passe2", host: "jeanpierre", days: -5, time: "12:00", title: "Confit de canard", description: "Avec des pommes sarladaises.", neighborhood: "Caudéran", address: "42 avenue Louis Barthou, 33200 Bordeaux", seats: 2, dietTags: [] },
];

const BOOKINGS: Array<{ meal: string; student: string; status: BookingStatus; message: string }> = [
  { meal: "blanquette", student: "lea", status: "accepted", message: "Bonjour Mireille, je suis en master d'histoire, ravie de partager ce repas !" },
  { meal: "blanquette", student: "karim", status: "pending", message: "Bonsoir, étudiant en ingénierie, j'adore la cuisine française." },
  { meal: "lasagnes", student: "lea", status: "pending", message: "J'adore les lasagnes, et les enfants aussi !" },
  { meal: "tajine", student: "lea", status: "declined", message: "Bonjour Samira !" },
  { meal: "tajine", student: "karim", status: "accepted", message: "Salam, avec grand plaisir." },
  { meal: "garbure", student: "karim", status: "pending", message: "Curieux de découvrir la garbure !" },
  { meal: "passe1", student: "lea", status: "accepted", message: "Merci pour l'invitation." },
  { meal: "passe2", student: "karim", status: "accepted", message: "Avec plaisir." },
];

function parisAt(days: number, time: string): Date {
  let day = dateToParisLocal(new Date()).slice(0, 10);
  if (days >= 0) {
    for (let i = 0; i < days; i++) day = nextDay(day);
  } else {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    day = d.toISOString().slice(0, 10);
  }
  return parisLocalToDate(`${day}T${time}`);
}

async function findAuthUserId(email: string): Promise<string | undefined> {
  const result = await db.execute(sql`select id from neon_auth."user" where email = ${email}`);
  return (result.rows[0] as { id?: string } | undefined)?.id;
}

async function ensureAuthUser(person: Person): Promise<string> {
  const existing = await findAuthUserId(person.email);
  if (existing) return existing;
  const res = await fetch(`${authBaseUrl}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: person.email, password, name: person.firstName }),
  });
  if (!res.ok) throw new Error(`Inscription de ${person.email} impossible : ${res.status} ${await res.text()}`);
  const id = await findAuthUserId(person.email);
  if (!id) throw new Error(`Utilisateur ${person.email} introuvable après inscription`);
  return id;
}

async function main() {
  const ids = new Map<string, string>();
  for (const person of PEOPLE) {
    const userId = await ensureAuthUser(person);
    ids.set(person.key, userId);
    const values = {
      userId,
      role: person.role,
      firstName: person.firstName,
      school: person.school ?? null,
      verificationStatus: person.verificationStatus ?? "none",
      suspended: false,
    };
    await db.insert(profiles).values(values).onConflictDoUpdate({ target: profiles.userId, set: values });
  }

  const hostIds = PEOPLE.filter((p) => p.role === "host").map((p) => ids.get(p.key)!);
  await db.delete(meals).where(inArray(meals.hostId, hostIds));

  const mealIds = new Map<string, string>();
  for (const m of MEALS) {
    const [row] = await db
      .insert(meals)
      .values({
        hostId: ids.get(m.host)!,
        title: m.title,
        description: m.description,
        startsAt: parisAt(m.days, m.time),
        neighborhood: m.neighborhood,
        address: m.address,
        seatsTotal: m.seats,
        dietTags: m.dietTags,
        allergens: m.allergens ?? "",
      })
      .returning({ id: meals.id });
    mealIds.set(m.key, row.id);
  }

  for (const b of BOOKINGS) {
    await db.insert(bookings).values({
      mealId: mealIds.get(b.meal)!,
      studentId: ids.get(b.student)!,
      status: b.status,
      requestMessage: b.message,
    });
  }

  console.log(`Démo prête : ${PEOPLE.length} comptes, ${MEALS.length} repas, ${BOOKINGS.length} demandes.`);
  await db.$client.end();
}

main().catch(async (error) => {
  console.error(error);
  await db.$client.end();
  process.exit(1);
});
```

- [ ] **Step 7: Lancer le seed deux fois (idempotence)**

Run: `npm run seed:demo && npm run seed:demo`
Expected: deux fois `Démo prête : 9 comptes, 15 repas, 8 demandes.` Avec `run_sql` sur `demo`, `select count(*) from meals` doit renvoyer `15`, pas 30.

Si la première inscription échoue avec une erreur de domaine ou d'origine, lancer `npm run dev` dans un autre terminal et relancer le seed (l'origine `http://localhost:3000` est autorisée par défaut).

- [ ] **Step 8: Vérifier**

Run: `npm run lint && npm run build && npm test && npm run test:integration`
Expected: tout passe.

Vérification manuelle (`npm run dev`) :
1. Le bandeau démo s'affiche.
2. `/connexion`, puis « Léa — étudiante vérifiée » : on arrive sur `/repas` avec 13 repas à venir.
3. Ouvrir « Pâtes au pesto maison » et envoyer une demande : le statut « En attente » s'affiche.
4. Se déconnecter, puis « Mireille — hôte aux Chartrons » : `/hote/offres` affiche ses repas et la demande de Karim sur la blanquette.
5. Accepter Karim sur la blanquette : le badge passe à « 0 place(s) libre(s) sur 2 ».
6. Relancer `npm run seed:demo` pour remettre la démo à zéro.

- [ ] **Step 9: Commit**

```bash
git add src scripts
git commit -m "feat: accueil, navigation, mode démo et données de démo bordelaises

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Déploiement Vercel (démo partageable) et recette

**Files:**
- Create: `README.md`
- Modify: `.gitignore` (ajout de `.vercel` par `vercel link`)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: une URL de démo stable, `https://ocleans-demo.vercel.app` (ou une variante disponible).

- [ ] **Step 1: Installer la CLI Vercel et se connecter**

```bash
npm i -g vercel@latest
```

Demander à l'utilisateur de taper `! vercel login` dans le prompt (connexion interactive).

- [ ] **Step 2: Lier le projet**

Run: `vercel link --yes --project ocleans`
Expected: un dossier `.vercel/` est créé et ajouté au `.gitignore`.

- [ ] **Step 3: Variables d'environnement (Preview et Development)**

Charger le skill `vercel:env`, puis créer pour les cibles `preview` et `development` les variables `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DEMO_PASSWORD` (mêmes valeurs que `.env.local`) et `DEMO_MODE=true`. On peut utiliser l'outil MCP `create_project_env` (ToolSearch `select:mcp__plugin_vercel_vercel__create_project_env`) avec le `projectId` de `.vercel/project.json`, en type `encrypted`, sauf `DEMO_MODE` en `plain`. Ne pas créer `DATABASE_URL_TEST` sur Vercel, et ne rien créer en Production (réservée au pilote).

Vérification : `vercel env ls` liste les 5 noms pour Preview, sans afficher de valeur.

- [ ] **Step 4: Déployer et poser un alias stable**

```bash
vercel deploy --yes
```

Noter l'URL affichée, puis :

```bash
vercel alias set <url-du-déploiement> ocleans-demo.vercel.app
```

Si `ocleans-demo` est déjà pris, essayer `ocleans-bordeaux-demo.vercel.app` et utiliser ce nom dans les étapes suivantes.

- [ ] **Step 5: Autoriser le domaine dans Neon Auth**

Outil MCP `add_auth_trusted_domain` sur la branche `demo`, avec `https://ocleans-demo.vercel.app` (sans `/` final).

- [ ] **Step 6: Protection des déploiements**

Les déploiements Preview sont protégés par défaut : seuls les membres de l'équipe Vercel y accèdent. Demander à l'utilisateur ce qu'il préfère : inviter son ami dans l'équipe Vercel (recommandé), ou désactiver la protection des Preview pour ce projet (Settings → Deployment Protection). Ne rien changer sans sa réponse.

- [ ] **Step 7: Recette sur l'URL de démo**

Avec les outils Playwright MCP, sur `https://ocleans-demo.vercel.app` en viewport mobile (390×844) :
1. Ouvrir `/hote/offres` sans être connecté : redirection vers `/connexion`.
2. Connexion rapide « Léa » : `/repas` liste les repas à venir avec quartier, date et heure de Paris cohérentes avec le seed.
3. Ouvrir « Pâtes au pesto maison », envoyer une demande : le statut « En attente » s'affiche, et l'adresse n'apparaît pas dans le HTML (vérifier avec `browser_evaluate` que `document.body.innerText` ne contient pas « rue des Faures »).
4. Déconnexion, connexion « Mireille », puis accepter la demande de Karim sur « Blanquette de veau ».
5. Prendre une capture d'écran de `/repas` et de `/hote/offres`.
6. Relancer `npm run seed:demo` en local pour remettre la démo à zéro (même base que la Preview).

Expected: les 6 points sont conformes. Sinon, consulter les logs avec l'outil MCP `get_runtime_logs` et corriger avant de continuer.

- [ ] **Step 8: README**

`README.md` :

````markdown
# Ocleans

Repas partagés entre habitants et étudiants à Bordeaux : un hôte cuisine une portion de plus, un étudiant vérifié demande à partager le repas.

- Spec : `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md`
- Démo : https://ocleans-demo.vercel.app

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs (branches Neon demo et test)
npm run db:migrate
npm run db:migrate:test
npm run seed:demo
npm run dev
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (règles métier) |
| `npm run test:integration` | Tests contre la branche Neon `test` |
| `npm run db:generate` | Générer une migration après modification de `src/db/schema.ts` |
| `npm run db:migrate` / `db:migrate:test` | Appliquer les migrations sur `demo` / `test` |
| `npm run seed:demo` | (Ré)initialiser les données de démo |
| `vercel deploy` | Déployer une Preview (démo) |
````

- [ ] **Step 9: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: README et déploiement de la démo sur Vercel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
