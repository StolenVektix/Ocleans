# Ocleans — Plan 2 : vérification étudiante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un étudiant inscrit de devenir `verified`, soit en confirmant l'adresse universitaire de son compte par un code envoyé par Neon Auth, soit en envoyant sa carte étudiante qu'un admin valide ou refuse depuis un écran dédié. La photo de la carte est supprimée dès la décision.

**Architecture:** Les règles (domaines universitaires, établissements, numéro étudiant, fichier) sont des fonctions pures dans `src/config/` et `src/domain/verification.ts`. Le service `src/server/verification/service.ts` prend `(db, storage, actor, …)`. Le stockage passe par une interface `CardStorage`, avec une implémentation S3 (Neon Object Storage, bucket privé) et une implémentation en mémoire pour les tests. Le statut « email vérifié » est lu directement dans `neon_auth."user"` (même base), jamais dans le cache de session. Les écrans réutilisent les primitives et les conventions du Plan 1.

**Tech Stack:** Next.js 16, Neon Postgres + Drizzle, Neon Auth (Email OTP), Neon Object Storage via `@aws-sdk/client-s3` et `@aws-sdk/s3-request-presigner`, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md` (§4 mis à jour le 2026-10-22, §6, §9)

**Hors de ce plan :** l'email de résultat à l'étudiant (option B, Plan 3), le nettoyage planifié des photos en attente depuis plus de 30 jours (Plan 4), les limites anti-abus (Plan 4).

## Global Constraints

- Toutes les contraintes globales du Plan 1 restent valables : interface en français, Next.js 16 (`params` et `searchParams` sont des `Promise`), Drizzle sans `db.query.*`, aucun secret committé, commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Seuls les domaines **confirmés** figurent dans `UNIVERSITY_DOMAINS` (aujourd'hui `etu.u-bordeaux.fr`). La correspondance du domaine est exacte, en minuscules : ni sous-domaine, ni suffixe.
- L'email vérifié est celui **du compte** : le code est envoyé par Neon Auth (`emailOtp.sendVerificationOtp`, `type: "email-verification"`) et validé par `emailOtp.verifyEmail`. Le serveur ne fait confiance qu'à `neon_auth."user"."emailVerified"`.
- Photo de carte : JPEG, PNG, HEIC ou HEIF, **4 Mo maximum**. Elle va dans un bucket **privé**. L'admin la voit par une URL signée valable **300 secondes**. Elle est **supprimée dès la décision**, et la colonne `card_object_key` est remise à `null`.
- Les variables de stockage s'appellent `NEON_STORAGE_*`. Vercel réserve les noms `AWS_*` ; ne jamais s'appuyer sur la chaîne d'identifiants AWS par défaut.
- Un étudiant `pending` ou `verified` ne peut pas soumettre une nouvelle vérification. Un étudiant `rejected` le peut.
- Seul un admin actif peut lister ou trancher les cartes. Un refus exige un motif de 3 à 300 caractères.

## Review Focus

1. **Adresses trompeuses** : `Lea@ETU.u-bordeaux.fr ` (majuscules, espace) doit être acceptée. `x@u-bordeaux.fr` (adresse du personnel), `x@etu.u-bordeaux.fr.evil.com`, `x@evil-etu.u-bordeaux.fr` et `constructor@toString` doivent être refusées. Tests ajoutés en Task 1.
2. **Deux admins tranchent la même carte en même temps** : une seule décision est enregistrée, la photo n'est supprimée qu'une fois, et le second admin reçoit « Cette demande a déjà reçu une réponse ». Test ajouté en Task 4.
3. **Double envoi de la carte** (double-clic) : une seule demande `pending`, et une seule photo stockée. La photo du second envoi est supprimée. Test ajouté en Task 4.
4. **Photo d'iPhone trop lourde ou en HEIC** : le HEIC est accepté. Un fichier de plus de 4 Mo affiche un message clair côté navigateur avant l'envoi, et le serveur le refuse aussi, sans erreur 413 brute. Test serveur en Task 4, vérification navigateur en Task 8.
5. **Email confirmé alors que le cache de session dit encore « non vérifié »** : la confirmation doit réussir, puisque le serveur lit `neon_auth."user"`. Test ajouté en Task 4, où l'identité vient de la table et non de la session.

---

## Structure des fichiers

```
src/config/university-domains.ts      domaines email étudiants confirmés → établissement
src/config/schools.ts                 établissements proposés pour la carte, règles du numéro étudiant
src/domain/verification.ts            règles pures : numéro, fichier, droits de soumission et de revue
src/db/schema.ts                      + table verifications
src/services/storage.ts               interface CardStorage, implémentations S3 (Neon) et mémoire
src/server/auth-identity.ts           lecture de neon_auth."user" (email, emailVerified)
src/server/verification/service.ts    vue d'ensemble, confirmation email, envoi de carte, file admin, décision
src/server/verification/actions.ts    Server Actions correspondantes
src/components/email-verification-panel.tsx   envoi et saisie du code (client)
src/components/card-form.tsx          formulaire de carte (client)
src/components/review-buttons.tsx     valider / refuser (client)
src/app/etudiant/verification/page.tsx
src/app/admin/verifications/page.tsx
scripts/check-storage.ts              vérification manuelle du bucket
```

---

### Task 1: Domaines universitaires, établissements et règles de vérification

**Files:**
- Create: `src/config/university-domains.ts`, `src/config/schools.ts`, `src/domain/verification.ts`
- Modify: `src/domain/errors.ts`, `src/domain/types.ts`
- Test: `src/config/university-domains.test.ts`, `src/domain/verification.test.ts`

**Interfaces:**
- Consumes: `Actor`, `assertActive` (`src/domain/bookings.ts`, Plan 1) ; `DomainError`.
- Produces:
  - `UNIVERSITY_DOMAINS: Readonly<Record<string, string>>`, `emailDomain(email: string): string | null`, `universityForEmail(email: string): string | null`
  - `SCHOOLS` (tuple `{ id, label }`), `SCHOOL_IDS: [SchoolId, ...SchoolId[]]`, `type SchoolId`, `schoolLabel(id: SchoolId): string`, `STUDENT_NUMBER_RULES`, `DEFAULT_STUDENT_NUMBER_RULE`
  - `VERIFICATION_METHODS = ["university_email", "card"]`, `VERIFICATION_REQUEST_STATUSES = ["pending", "approved", "rejected"]` et leurs types `VerificationMethod`, `VerificationRequestStatus`
  - Nouveaux codes d'erreur : `ALREADY_VERIFIED`, `VERIFICATION_PENDING`, `NOT_UNIVERSITY_EMAIL`, `EMAIL_NOT_VERIFIED`
  - `CARD_MAX_BYTES`, `CARD_CONTENT_TYPES`, `normalizeStudentNumber(raw)`, `isValidStudentNumber(schoolId, n)`, `type CardFileProblem`, `CARD_FILE_MESSAGES`, `checkCardFile({ type, size })`, `cardExtension(type)`, `assertCanSubmitVerification(actor)`, `assertIsAdmin(actor)`

- [ ] **Step 1: Écrire les tests (échouent)**

`src/config/university-domains.test.ts` :

```ts
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
```

`src/domain/verification.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import type { Actor } from "./bookings";
import {
  CARD_MAX_BYTES,
  assertCanSubmitVerification,
  assertIsAdmin,
  cardExtension,
  checkCardFile,
  isValidStudentNumber,
  normalizeStudentNumber,
} from "./verification";

const student: Actor = { userId: "s1", role: "student", verificationStatus: "none", suspended: false };
const admin: Actor = { userId: "a1", role: "admin", verificationStatus: "none", suspended: false };
const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("numéro étudiant", () => {
  it("normalise espaces, tirets et casse", () => {
    expect(normalizeStudentNumber(" 21 45-6789a ")).toBe("21456789A");
  });

  it("accepte 5 à 15 lettres ou chiffres par défaut", () => {
    expect(isValidStudentNumber("u-bordeaux", "21456789")).toBe(true);
    expect(isValidStudentNumber("autre", "AB123")).toBe(true);
    expect(isValidStudentNumber("u-bordeaux", "1234")).toBe(false);
    expect(isValidStudentNumber("u-bordeaux", "1234567890123456")).toBe(false);
    expect(isValidStudentNumber("u-bordeaux", "12345_678")).toBe(false);
  });
});

describe("fichier de carte", () => {
  it("accepte JPEG, PNG, HEIC et HEIF jusqu'à 4 Mo", () => {
    expect(checkCardFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(checkCardFile({ type: "image/heic", size: CARD_MAX_BYTES })).toBeNull();
    expect(cardExtension("image/png")).toBe("png");
    expect(cardExtension("image/heif")).toBe("heif");
  });

  it("refuse un fichier vide, trop lourd ou d'un autre type", () => {
    expect(checkCardFile({ type: "image/jpeg", size: 0 })).toBe("EMPTY");
    expect(checkCardFile({ type: "image/jpeg", size: CARD_MAX_BYTES + 1 })).toBe("TOO_LARGE");
    expect(checkCardFile({ type: "application/pdf", size: 1000 })).toBe("BAD_TYPE");
  });
});

describe("droits", () => {
  it("autorise un étudiant non vérifié ou refusé à soumettre", () => {
    expect(code(() => assertCanSubmitVerification(student))).toBeNull();
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "rejected" }))).toBeNull();
  });

  it("refuse les autres cas de soumission", () => {
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "verified" }))).toBe("ALREADY_VERIFIED");
    expect(code(() => assertCanSubmitVerification({ ...student, verificationStatus: "pending" }))).toBe("VERIFICATION_PENDING");
    expect(code(() => assertCanSubmitVerification({ ...student, role: "host" }))).toBe("FORBIDDEN");
    expect(code(() => assertCanSubmitVerification({ ...student, suspended: true }))).toBe("SUSPENDED");
  });

  it("réserve la revue aux admins actifs", () => {
    expect(code(() => assertIsAdmin(admin))).toBeNull();
    expect(code(() => assertIsAdmin(student))).toBe("FORBIDDEN");
    expect(code(() => assertIsAdmin({ ...admin, suspended: true }))).toBe("SUSPENDED");
  });
});
```

- [ ] **Step 2: Lancer**

Run: `npm test -- src/config/university-domains.test.ts src/domain/verification.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`src/config/university-domains.ts` :

```ts
// Domaines étudiants confirmés uniquement : une adresse du personnel (@u-bordeaux.fr) ne doit pas suffire.
// Ajouter un domaine seulement après confirmation auprès de l'établissement.
export const UNIVERSITY_DOMAINS: Readonly<Record<string, string>> = {
  "etu.u-bordeaux.fr": "Université de Bordeaux",
};

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function universityForEmail(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain || !Object.hasOwn(UNIVERSITY_DOMAINS, domain)) return null;
  return UNIVERSITY_DOMAINS[domain];
}
```

`src/config/schools.ts` :

```ts
export const SCHOOLS = [
  { id: "u-bordeaux", label: "Université de Bordeaux" },
  { id: "u-bordeaux-montaigne", label: "Université Bordeaux Montaigne" },
  { id: "bordeaux-inp", label: "Bordeaux INP" },
  { id: "sciences-po-bordeaux", label: "Sciences Po Bordeaux" },
  { id: "kedge", label: "KEDGE Business School" },
  { id: "autre", label: "Autre établissement bordelais" },
] as const;

export type SchoolId = (typeof SCHOOLS)[number]["id"];

export const SCHOOL_IDS = SCHOOLS.map((s) => s.id) as [SchoolId, ...SchoolId[]];

export function schoolLabel(id: SchoolId): string {
  return SCHOOLS.find((s) => s.id === id)!.label;
}

// Aucun format officiel confirmé à ce jour : règle commune, surchargeable par établissement.
export const DEFAULT_STUDENT_NUMBER_RULE = /^[A-Z0-9]{5,15}$/;
export const STUDENT_NUMBER_RULES: Partial<Record<SchoolId, RegExp>> = {};
```

Ajouter dans `src/domain/types.ts` :

```ts
export const VERIFICATION_METHODS = ["university_email", "card"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export type VerificationRequestStatus = (typeof VERIFICATION_REQUEST_STATUSES)[number];
```

Dans `src/domain/errors.ts`, ajouter les quatre codes à l'union `DomainErrorCode` et à `MESSAGES` :

```ts
  | "ALREADY_VERIFIED"
  | "VERIFICATION_PENDING"
  | "NOT_UNIVERSITY_EMAIL"
  | "EMAIL_NOT_VERIFIED";
```

```ts
  ALREADY_VERIFIED: "Votre statut étudiant est déjà vérifié.",
  VERIFICATION_PENDING: "Une vérification est déjà en cours d'examen.",
  NOT_UNIVERSITY_EMAIL: "L'adresse de votre compte n'est pas une adresse universitaire reconnue.",
  EMAIL_NOT_VERIFIED: "Votre adresse n'a pas encore été confirmée avec le code reçu par email.",
```

`src/domain/verification.ts` :

```ts
import { DEFAULT_STUDENT_NUMBER_RULE, STUDENT_NUMBER_RULES, type SchoolId } from "@/config/schools";
import { assertActive, type Actor } from "./bookings";
import { DomainError } from "./errors";

export const CARD_MAX_BYTES = 4 * 1024 * 1024;

export const CARD_CONTENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

export type CardFileProblem = "EMPTY" | "TOO_LARGE" | "BAD_TYPE";

export const CARD_FILE_MESSAGES: Record<CardFileProblem, string> = {
  EMPTY: "Ajoutez une photo de votre carte étudiante.",
  TOO_LARGE: "La photo dépasse 4 Mo. Réduisez sa taille ou prenez une photo moins lourde.",
  BAD_TYPE: "Format non accepté : utilisez une photo JPEG, PNG ou HEIC.",
};

export function normalizeStudentNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidStudentNumber(schoolId: SchoolId, value: string): boolean {
  return (STUDENT_NUMBER_RULES[schoolId] ?? DEFAULT_STUDENT_NUMBER_RULE).test(value);
}

export function checkCardFile(file: { type: string; size: number }): CardFileProblem | null {
  if (file.size <= 0) return "EMPTY";
  if (!Object.hasOwn(CARD_CONTENT_TYPES, file.type)) return "BAD_TYPE";
  if (file.size > CARD_MAX_BYTES) return "TOO_LARGE";
  return null;
}

export function cardExtension(type: string): string {
  return CARD_CONTENT_TYPES[type as keyof typeof CARD_CONTENT_TYPES];
}

export function assertCanSubmitVerification(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "student") throw new DomainError("FORBIDDEN");
  if (actor.verificationStatus === "verified") throw new DomainError("ALREADY_VERIFIED");
  if (actor.verificationStatus === "pending") throw new DomainError("VERIFICATION_PENDING");
}

export function assertIsAdmin(actor: Actor): void {
  assertActive(actor);
  if (actor.role !== "admin") throw new DomainError("FORBIDDEN");
}
```

- [ ] **Step 4: Lancer**

Run: `npm test`
Expected: PASS (tous les tests unitaires, anciens et nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/config src/domain
git commit -m "feat: domaines universitaires, établissements et règles de vérification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Table des vérifications et harnais de test

**Files:**
- Modify: `src/db/schema.ts`, `tests/integration/helpers.ts`
- Create: `drizzle/0001_*.sql` (généré)
- Test: `tests/integration/schema.test.ts` (ajout d'un cas)

**Interfaces:**
- Consumes: `VERIFICATION_METHODS`, `VERIFICATION_REQUEST_STATUSES` (Task 1).
- Produces:
  - Table `verifications` : `id`, `userId`, `method`, `universityEmail`, `school`, `studentNumber`, `cardObjectKey`, `status`, `rejectionReason`, `reviewedBy`, `reviewedAt`, `createdAt`, `updatedAt` ; type `Verification`
  - Helpers : `resetDb()` (qui crée aussi au besoin un `neon_auth."user"` minimal sur la branche de test, puis le vide), `makeAuthUser(email, emailVerified?) → Promise<string>`

- [ ] **Step 1: Ajouter la table au schéma**

Dans `src/db/schema.ts`, compléter l'import depuis `../domain/types` avec `VERIFICATION_METHODS` et `VERIFICATION_REQUEST_STATUSES`, puis ajouter avant les exports de types :

```ts
export const verificationMethodEnum = pgEnum("verification_method", VERIFICATION_METHODS);
export const verificationRequestStatusEnum = pgEnum("verification_request_status", VERIFICATION_REQUEST_STATUSES);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    method: verificationMethodEnum("method").notNull(),
    universityEmail: text("university_email"),
    school: text("school"),
    studentNumber: text("student_number"),
    cardObjectKey: text("card_object_key"),
    status: verificationRequestStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("verifications_user_idx").on(t.userId), index("verifications_status_idx").on(t.status)],
);
```

et :

```ts
export type Verification = typeof verifications.$inferSelect;
```

- [ ] **Step 2: Générer et appliquer**

```bash
npm run db:generate && npm run db:migrate && npm run db:migrate:test
```

Expected: `drizzle/0001_*.sql` créé, et les deux migrations appliquées sans erreur.

- [ ] **Step 3: Harnais : utilisateurs Neon Auth simulés sur la branche de test**

La branche `test` n'a pas Neon Auth. On y crée une table `neon_auth."user"` réduite aux colonnes lues par l'application. Dans `tests/integration/helpers.ts`, remplacer `resetDb` et ajouter `makeAuthUser` :

```ts
export async function resetDb() {
  // La branche de test n'a pas Neon Auth : table minimale avec les seules colonnes lues par l'application.
  await db.execute(sql`create schema if not exists neon_auth`);
  await db.execute(
    sql`create table if not exists neon_auth."user" (id uuid primary key default gen_random_uuid(), email text not null, "emailVerified" boolean not null default false)`,
  );
  await db.execute(sql`truncate table verifications, bookings, meals, profiles, neon_auth."user" cascade`);
}

export async function makeAuthUser(email: string, emailVerified = false): Promise<string> {
  const result = await db.execute(
    sql`insert into neon_auth."user" (email, "emailVerified") values (${email}, ${emailVerified}) returning id::text as id`,
  );
  return (result.rows[0] as { id: string }).id;
}
```

- [ ] **Step 4: Test du schéma**

Ajouter dans `tests/integration/schema.test.ts`, dans le `describe("schéma")` (et `verifications` dans l'import de `@/db/schema`, avec `db` dans l'import des helpers) :

```ts
  it("enregistre une demande de vérification par carte en attente", async () => {
    const student = await makeProfile({ verificationStatus: "none" });
    const [row] = await db
      .insert(verifications)
      .values({ userId: student.userId, method: "card", school: "Bordeaux INP", studentNumber: "21456789", cardObjectKey: "cards/x.jpg" })
      .returning();
    expect(row).toMatchObject({ status: "pending", reviewedAt: null, rejectionReason: null });
  });
```

Run: `npm run test:integration`
Expected: PASS (29 tests existants et le nouveau).

- [ ] **Step 5: Commit**

```bash
git add src/db drizzle tests/integration
git commit -m "feat: table des vérifications et utilisateurs Neon Auth simulés en test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stockage des cartes (Neon Object Storage)

**Files:**
- Create: `src/services/storage.ts`, `scripts/check-storage.ts`
- Test: `src/services/storage.test.ts`
- Modify: `.env.example`, `.env.local` (non committé)

**Interfaces:**
- Produces:
  - `interface CardStorage { put(key: string, body: Uint8Array, contentType: string): Promise<void>; signedUrl(key: string, expiresInSeconds: number): Promise<string>; delete(key: string): Promise<void> }`
  - `interface NeonStorageConfig { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string }`
  - `createNeonStorage(cfg): CardStorage`, `storageConfigFromEnv(env?): NeonStorageConfig`, `getCardStorage(): CardStorage`
  - `createMemoryStorage(): CardStorage & { objects: Map<string, { body: Uint8Array; contentType: string }> }`

- [ ] **Step 1: Créer le bucket et un identifiant sur la branche `demo`**

Outils MCP Neon (charger les schémas avec ToolSearch) :
1. `create_storage_bucket` avec `project_id: "icy-bar-75721928"`, `branch_id: "br-mute-rain-b9gdgqpe"`, `name: "student-cards"`, `access_level: "private"`.
2. `create_credential` sur la même branche, avec `scopes: ["storage:read", "storage:write"]`, `principal_type: "user"` et `name: "ocleans-app"`. Noter l'identifiant et le secret renvoyés, sans les afficher dans la conversation au-delà de leur écriture dans `.env.local`.
3. `get_storage` sur la branche : noter `s3_endpoint` et `region`.

- [ ] **Step 2: Variables d'environnement**

Ajouter à `.env.example` :

```bash
# Neon Object Storage, branche "demo" (bucket privé des cartes étudiantes)
# Ne pas utiliser les noms AWS_* : Vercel les réserve.
NEON_STORAGE_ENDPOINT=
NEON_STORAGE_REGION=
NEON_STORAGE_ACCESS_KEY_ID=
NEON_STORAGE_SECRET_ACCESS_KEY=
NEON_STORAGE_BUCKET=student-cards
```

Ajouter les mêmes noms, avec leurs valeurs, à la fin de `.env.local`, avec un `cat >> .env.local <<'EOF'` dont les valeurs sont **entre guillemets simples**. Ne jamais sourcer `.env.local` dans le shell.

- [ ] **Step 3: Installer le client S3**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 4: Écrire le test du stockage en mémoire et de la configuration (échoue)**

`src/services/storage.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { createMemoryStorage, storageConfigFromEnv } from "./storage";

describe("createMemoryStorage", () => {
  it("stocke, signe et supprime un objet", async () => {
    const storage = createMemoryStorage();
    await storage.put("cards/u1/a.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(storage.objects.get("cards/u1/a.jpg")?.contentType).toBe("image/jpeg");
    expect(await storage.signedUrl("cards/u1/a.jpg", 300)).toContain("cards/u1/a.jpg");
    await storage.delete("cards/u1/a.jpg");
    expect(storage.objects.size).toBe(0);
  });
});

describe("storageConfigFromEnv", () => {
  it("lit les variables NEON_STORAGE_* et signale celle qui manque", () => {
    const env = {
      NEON_STORAGE_ENDPOINT: "https://e",
      NEON_STORAGE_REGION: "eu-central-1",
      NEON_STORAGE_ACCESS_KEY_ID: "id",
      NEON_STORAGE_SECRET_ACCESS_KEY: "secret",
      NEON_STORAGE_BUCKET: "student-cards",
    };
    expect(storageConfigFromEnv(env)).toEqual({
      endpoint: "https://e",
      region: "eu-central-1",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "student-cards",
    });
    expect(() => storageConfigFromEnv({ ...env, NEON_STORAGE_BUCKET: "" })).toThrow("NEON_STORAGE_BUCKET");
  });
});
```

Run: `npm test -- src/services/storage.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 5: Implémenter**

`src/services/storage.ts` :

```ts
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface CardStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface NeonStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function createNeonStorage(cfg: NeonStorageConfig): CardStorage {
  const s3 = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: true, // exigé par Neon Object Storage
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    async put(key, body, contentType) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    signedUrl(key, expiresInSeconds) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

const STORAGE_VARS = {
  endpoint: "NEON_STORAGE_ENDPOINT",
  region: "NEON_STORAGE_REGION",
  accessKeyId: "NEON_STORAGE_ACCESS_KEY_ID",
  secretAccessKey: "NEON_STORAGE_SECRET_ACCESS_KEY",
  bucket: "NEON_STORAGE_BUCKET",
} as const;

export function storageConfigFromEnv(env: Record<string, string | undefined> = process.env): NeonStorageConfig {
  const read = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} manquant`);
    return value;
  };
  return {
    endpoint: read(STORAGE_VARS.endpoint),
    region: read(STORAGE_VARS.region),
    accessKeyId: read(STORAGE_VARS.accessKeyId),
    secretAccessKey: read(STORAGE_VARS.secretAccessKey),
    bucket: read(STORAGE_VARS.bucket),
  };
}

let cached: CardStorage | undefined;

export function getCardStorage(): CardStorage {
  cached ??= createNeonStorage(storageConfigFromEnv());
  return cached;
}

export function createMemoryStorage(): CardStorage & { objects: Map<string, { body: Uint8Array; contentType: string }> } {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async signedUrl(key, expiresInSeconds) {
      return `memory://${key}?expires=${expiresInSeconds}`;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
```

Run: `npm test -- src/services/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Vérifier le vrai bucket**

`scripts/check-storage.ts` :

```ts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";

async function main() {
  const storage = createNeonStorage(storageConfigFromEnv());
  const key = `checks/${Date.now()}.txt`;
  const body = new TextEncoder().encode("ocleans");
  await storage.put(key, body, "text/plain");
  const url = await storage.signedUrl(key, 60);
  const fetched = await (await fetch(url)).text();
  await storage.delete(key);
  const afterDelete = (await fetch(url)).status;
  console.log(`lecture: ${fetched === "ocleans" ? "OK" : "KO"} ; après suppression: HTTP ${afterDelete}`);
  if (fetched !== "ocleans" || afterDelete < 400) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Run: `npx tsx scripts/check-storage.ts`
Expected: `lecture: OK ; après suppression: HTTP 404` (ou un autre code 4xx).

- [ ] **Step 7: Commit**

```bash
git add src/services scripts/check-storage.ts .env.example package.json package-lock.json
git commit -m "feat: stockage privé des cartes étudiantes (Neon Object Storage)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Service de vérification

**Files:**
- Create: `src/server/auth-identity.ts`, `src/server/verification/service.ts`
- Test: `tests/integration/verification.test.ts`

**Interfaces:**
- Consumes: Task 1 (règles, codes), Task 2 (`verifications`, `makeAuthUser`), Task 3 (`CardStorage`, `createMemoryStorage`) ; `Db`, `Tx` (Plan 1) ; `isUuid`.
- Produces:
  - `getAuthIdentity(db: Db | Tx, userId: string): Promise<{ email: string; emailVerified: boolean } | null>`
  - `interface VerificationOverview { status: VerificationStatus; email: string | null; emailVerified: boolean; university: string | null; latest: { method: VerificationMethod; status: VerificationRequestStatus; rejectionReason: string | null; createdAt: Date } | null }`
  - `getVerificationOverview(db, actor): Promise<VerificationOverview>`
  - `confirmUniversityEmail(db, actor, now?): Promise<void>`
  - `interface CardFile { type: string; size: number; bytes: Uint8Array }`
  - `submitStudentCard(db, storage, actor, raw: { school?: unknown; studentNumber?: unknown }, file: CardFile): Promise<{ id: string }>`
  - `interface PendingCard { id: string; firstName: string; school: string | null; studentNumber: string | null; createdAt: Date; imageUrl: string | null }`
  - `listPendingCards(db, storage, actor): Promise<PendingCard[]>`
  - `reviewCard(db, storage, actor, verificationId, decision: "approve" | "reject", raw: { reason?: unknown }, now?): Promise<void>`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/verification.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { profiles, verifications } from "@/db/schema";
import { CARD_MAX_BYTES } from "@/domain/verification";
import { createMemoryStorage } from "@/services/storage";
import {
  confirmUniversityEmail,
  getVerificationOverview,
  listPendingCards,
  reviewCard,
  submitStudentCard,
} from "@/server/verification/service";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

const jpeg = (size = 1000) => ({ type: "image/jpeg", size, bytes: new Uint8Array(Math.min(size, 16)) });
const cardRaw = { school: "bordeaux-inp", studentNumber: "21 456 789" };

async function student(email: string, emailVerified = false, overrides: Partial<typeof profiles.$inferInsert> = {}) {
  const userId = await makeAuthUser(email, emailVerified);
  return makeProfile({ userId, role: "student", verificationStatus: "none", school: "Université de Bordeaux", ...overrides });
}

async function statusOf(userId: string) {
  const [p] = await db.select({ s: profiles.verificationStatus }).from(profiles).where(eq(profiles.userId, userId));
  return p.s;
}

beforeEach(resetDb);
afterAll(closeDb);

describe("confirmUniversityEmail", () => {
  it("vérifie un étudiant dont l'adresse universitaire est confirmée dans neon_auth", async () => {
    const s = await student("lea@etu.u-bordeaux.fr", true);
    await confirmUniversityEmail(db, s);
    expect(await statusOf(s.userId)).toBe("verified");
    const [v] = await db.select().from(verifications).where(eq(verifications.userId, s.userId));
    expect(v).toMatchObject({ method: "university_email", status: "approved", universityEmail: "lea@etu.u-bordeaux.fr", school: "Université de Bordeaux" });
  });

  it("refuse une adresse non confirmée ou non universitaire", async () => {
    const notConfirmed = await student("lea@etu.u-bordeaux.fr", false);
    await expect(confirmUniversityEmail(db, notConfirmed)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    const staff = await student("prof@u-bordeaux.fr", true);
    await expect(confirmUniversityEmail(db, staff)).rejects.toMatchObject({ code: "NOT_UNIVERSITY_EMAIL" });
    expect(await statusOf(notConfirmed.userId)).toBe("none");
  });

  it("refuse un étudiant déjà vérifié ou en attente, et un hôte", async () => {
    const verified = await student("a@etu.u-bordeaux.fr", true, { verificationStatus: "verified" });
    await expect(confirmUniversityEmail(db, verified)).rejects.toMatchObject({ code: "ALREADY_VERIFIED" });
    const pending = await student("b@etu.u-bordeaux.fr", true, { verificationStatus: "pending" });
    await expect(confirmUniversityEmail(db, pending)).rejects.toMatchObject({ code: "VERIFICATION_PENDING" });
    const hostId = await makeAuthUser("h@etu.u-bordeaux.fr", true);
    const host = await makeProfile({ userId: hostId, role: "host" });
    await expect(confirmUniversityEmail(db, host)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("submitStudentCard", () => {
  it("stocke la photo, crée une demande en attente et passe l'étudiant en pending", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    const { id } = await submitStudentCard(db, storage, s, cardRaw, jpeg());
    const [v] = await db.select().from(verifications).where(eq(verifications.id, id));
    expect(v).toMatchObject({ method: "card", status: "pending", school: "Bordeaux INP", studentNumber: "21456789" });
    expect(v.cardObjectKey).toMatch(new RegExp(`^cards/${s.userId}/[0-9a-f-]+\\.jpg$`));
    expect(storage.objects.has(v.cardObjectKey!)).toBe(true);
    expect(await statusOf(s.userId)).toBe("pending");
  });

  it("refuse un numéro invalide, un établissement inconnu, un fichier trop lourd ou d'un mauvais type, sans rien stocker", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    await expect(submitStudentCard(db, storage, s, { ...cardRaw, studentNumber: "12" }, jpeg())).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, { ...cardRaw, school: "harvard" }, jpeg())).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, cardRaw, jpeg(CARD_MAX_BYTES + 1))).rejects.toBeInstanceOf(ZodError);
    await expect(submitStudentCard(db, storage, s, cardRaw, { type: "application/pdf", size: 10, bytes: new Uint8Array(10) })).rejects.toBeInstanceOf(ZodError);
    expect(storage.objects.size).toBe(0);
    expect(await statusOf(s.userId)).toBe("none");
  });

  it("n'accepte qu'un envoi en cas de double-clic et supprime la photo en trop", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com");
    const results = await Promise.allSettled([
      submitStudentCard(db, storage, s, cardRaw, jpeg()),
      submitStudentCard(db, storage, s, cardRaw, jpeg()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "VERIFICATION_PENDING" });
    expect(storage.objects.size).toBe(1);
    expect(await db.select().from(verifications)).toHaveLength(1);
  });

  it("permet un nouvel envoi après un refus", async () => {
    const storage = createMemoryStorage();
    const s = await student("chloe@gmail.com", false, { verificationStatus: "rejected" });
    await submitStudentCard(db, storage, s, cardRaw, jpeg());
    expect(await statusOf(s.userId)).toBe("pending");
  });
});

describe("listPendingCards et reviewCard", () => {
  async function setup() {
    const storage = createMemoryStorage();
    const adminId = await makeAuthUser("admin@example.com");
    const admin = await makeProfile({ userId: adminId, role: "admin" });
    const s = await student("chloe@gmail.com", false, { firstName: "Chloé" });
    const { id } = await submitStudentCard(db, storage, s, cardRaw, jpeg());
    const freshStudent = { ...s, verificationStatus: "pending" as const };
    return { storage, admin, student: freshStudent, id };
  }

  it("liste les cartes en attente avec une URL signée de 5 minutes, pour un admin seulement", async () => {
    const { storage, admin, student: s, id } = await setup();
    const list = await listPendingCards(db, storage, admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, firstName: "Chloé", school: "Bordeaux INP", studentNumber: "21456789" });
    expect(list[0].imageUrl).toContain("expires=300");
    await expect(listPendingCards(db, storage, s)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("valide une carte : étudiant vérifié, photo supprimée, clé effacée", async () => {
    const { storage, admin, student: s, id } = await setup();
    await reviewCard(db, storage, admin, id, "approve", {});
    expect(await statusOf(s.userId)).toBe("verified");
    const [v] = await db.select().from(verifications).where(eq(verifications.id, id));
    expect(v).toMatchObject({ status: "approved", cardObjectKey: null, reviewedBy: admin.userId });
    expect(storage.objects.size).toBe(0);
    expect(await listPendingCards(db, storage, admin)).toHaveLength(0);
  });

  it("exige un motif pour refuser, puis enregistre le refus", async () => {
    const { storage, admin, student: s, id } = await setup();
    await expect(reviewCard(db, storage, admin, id, "reject", { reason: " " })).rejects.toBeInstanceOf(ZodError);
    expect(storage.objects.size).toBe(1);
    await reviewCard(db, storage, admin, id, "reject", { reason: "Photo illisible" });
    expect(await statusOf(s.userId)).toBe("rejected");
    const overview = await getVerificationOverview(db, { ...s, verificationStatus: "rejected" });
    expect(overview.latest).toMatchObject({ method: "card", status: "rejected", rejectionReason: "Photo illisible" });
    expect(storage.objects.size).toBe(0);
  });

  it("n'enregistre qu'une décision quand deux admins tranchent en même temps", async () => {
    const { storage, admin, id } = await setup();
    const otherId = await makeAuthUser("admin2@example.com");
    const other = await makeProfile({ userId: otherId, role: "admin" });
    const results = await Promise.allSettled([
      reviewCard(db, storage, admin, id, "approve", {}),
      reviewCard(db, storage, other, id, "reject", { reason: "Doublon" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(reviewCard(db, storage, admin, "abc", "approve", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getVerificationOverview", () => {
  it("indique l'adresse du compte, son statut et l'établissement reconnu", async () => {
    const s = await student("Lea@ETU.u-bordeaux.fr", false);
    expect(await getVerificationOverview(db, s)).toEqual({
      status: "none",
      email: "Lea@ETU.u-bordeaux.fr",
      emailVerified: false,
      university: "Université de Bordeaux",
      latest: null,
    });
  });
});
```

Run: `npm run test:integration -- tests/integration/verification.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Lecture de l'identité Neon Auth**

`src/server/auth-identity.ts` :

```ts
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/server/meals/service";

// Source de vérité de la vérification email : la table Neon Auth, jamais le cache de session (5 min).
export async function getAuthIdentity(db: Db | Tx, userId: string): Promise<{ email: string; emailVerified: boolean } | null> {
  const result = await db.execute(
    sql`select email, "emailVerified" as "emailVerified" from neon_auth."user" where id::text = ${userId} limit 1`,
  );
  const row = result.rows[0] as { email: string; emailVerified: boolean } | undefined;
  return row ? { email: row.email, emailVerified: Boolean(row.emailVerified) } : null;
}
```

- [ ] **Step 3: Service**

`src/server/verification/service.ts` :

```ts
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { SCHOOL_IDS, schoolLabel } from "@/config/schools";
import { universityForEmail } from "@/config/university-domains";
import type { Db } from "@/db/client";
import { profiles, verifications } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import type { VerificationMethod, VerificationRequestStatus, VerificationStatus } from "@/domain/types";
import {
  CARD_FILE_MESSAGES,
  assertCanSubmitVerification,
  assertIsAdmin,
  cardExtension,
  checkCardFile,
  isValidStudentNumber,
  normalizeStudentNumber,
} from "@/domain/verification";
import type { CardStorage } from "@/services/storage";
import { getAuthIdentity } from "@/server/auth-identity";

const SIGNED_URL_SECONDS = 300;

export interface VerificationOverview {
  status: VerificationStatus;
  email: string | null;
  emailVerified: boolean;
  university: string | null;
  latest: {
    method: VerificationMethod;
    status: VerificationRequestStatus;
    rejectionReason: string | null;
    createdAt: Date;
  } | null;
}

export interface CardFile {
  type: string;
  size: number;
  bytes: Uint8Array;
}

export interface PendingCard {
  id: string;
  firstName: string;
  school: string | null;
  studentNumber: string | null;
  createdAt: Date;
  imageUrl: string | null;
}

const cardSchema = z
  .object({
    school: z.enum(SCHOOL_IDS, { error: "Choisissez votre établissement" }),
    studentNumber: z.string({ error: "Indiquez votre numéro étudiant" }).transform(normalizeStudentNumber),
    card: z.object({ type: z.string(), size: z.number() }),
  })
  .superRefine((value, ctx) => {
    if (!isValidStudentNumber(value.school, value.studentNumber)) {
      ctx.addIssue({ code: "custom", path: ["studentNumber"], message: "Numéro étudiant invalide (5 à 15 lettres ou chiffres)" });
    }
    const problem = checkCardFile(value.card);
    if (problem) ctx.addIssue({ code: "custom", path: ["card"], message: CARD_FILE_MESSAGES[problem] });
  });

const reviewSchema = z.object({ reason: z.string().trim().max(300, "300 caractères maximum").default("") });

export async function getVerificationOverview(db: Db, actor: Actor): Promise<VerificationOverview> {
  const identity = await getAuthIdentity(db, actor.userId);
  const [latest] = await db
    .select({
      method: verifications.method,
      status: verifications.status,
      rejectionReason: verifications.rejectionReason,
      createdAt: verifications.createdAt,
    })
    .from(verifications)
    .where(eq(verifications.userId, actor.userId))
    .orderBy(desc(verifications.createdAt))
    .limit(1);
  return {
    status: actor.verificationStatus,
    email: identity?.email ?? null,
    emailVerified: identity?.emailVerified ?? false,
    university: identity ? universityForEmail(identity.email) : null,
    latest: latest ?? null,
  };
}

export async function confirmUniversityEmail(db: Db, actor: Actor, now = new Date()): Promise<void> {
  assertCanSubmitVerification(actor);
  const identity = await getAuthIdentity(db, actor.userId);
  if (!identity) throw new DomainError("NOT_FOUND");
  const university = universityForEmail(identity.email);
  if (!university) throw new DomainError("NOT_UNIVERSITY_EMAIL");
  if (!identity.emailVerified) throw new DomainError("EMAIL_NOT_VERIFIED");
  await db.transaction(async (tx) => {
    await tx.insert(verifications).values({
      userId: actor.userId,
      method: "university_email",
      universityEmail: identity.email.trim().toLowerCase(),
      school: university,
      status: "approved",
      reviewedAt: now,
    });
    await tx.update(profiles).set({ verificationStatus: "verified" }).where(eq(profiles.userId, actor.userId));
  });
}

export async function submitStudentCard(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  raw: { school?: unknown; studentNumber?: unknown },
  file: CardFile,
): Promise<{ id: string }> {
  assertCanSubmitVerification(actor);
  const input = cardSchema.parse({ ...raw, card: { type: file.type, size: file.size } });
  const key = `cards/${actor.userId}/${crypto.randomUUID()}.${cardExtension(file.type)}`;
  await storage.put(key, file.bytes, file.type);
  try {
    return await db.transaction(async (tx) => {
      // Verrou sur le profil : deux envois simultanés ne créent qu'une demande.
      const [fresh] = await tx.select().from(profiles).where(eq(profiles.userId, actor.userId)).for("update");
      if (!fresh) throw new DomainError("NOT_FOUND");
      assertCanSubmitVerification(fresh);
      const [row] = await tx
        .insert(verifications)
        .values({
          userId: actor.userId,
          method: "card",
          school: schoolLabel(input.school),
          studentNumber: input.studentNumber,
          cardObjectKey: key,
        })
        .returning({ id: verifications.id });
      await tx.update(profiles).set({ verificationStatus: "pending" }).where(eq(profiles.userId, actor.userId));
      return row;
    });
  } catch (error) {
    await storage.delete(key).catch((e) => console.warn("[verification] photo orpheline non supprimée", key, e));
    throw error;
  }
}

export async function listPendingCards(db: Db, storage: CardStorage, actor: Actor): Promise<PendingCard[]> {
  assertIsAdmin(actor);
  const rows = await db
    .select({
      id: verifications.id,
      firstName: profiles.firstName,
      school: verifications.school,
      studentNumber: verifications.studentNumber,
      createdAt: verifications.createdAt,
      cardObjectKey: verifications.cardObjectKey,
    })
    .from(verifications)
    .innerJoin(profiles, eq(profiles.userId, verifications.userId))
    .where(and(eq(verifications.method, "card"), eq(verifications.status, "pending")))
    .orderBy(asc(verifications.createdAt));
  return Promise.all(
    rows.map(async ({ cardObjectKey, ...row }) => ({
      ...row,
      imageUrl: cardObjectKey ? await storage.signedUrl(cardObjectKey, SIGNED_URL_SECONDS) : null,
    })),
  );
}

export async function reviewCard(
  db: Db,
  storage: CardStorage,
  actor: Actor,
  verificationId: string,
  decision: "approve" | "reject",
  raw: { reason?: unknown },
  now = new Date(),
): Promise<void> {
  assertIsAdmin(actor);
  const { reason } = reviewSchema.parse(raw);
  if (decision === "reject") {
    z.object({ reason: z.string().min(3, "Indiquez le motif du refus (3 caractères minimum)") }).parse({ reason });
  }
  if (!isUuid(verificationId)) throw new DomainError("NOT_FOUND");
  const key = await db.transaction(async (tx) => {
    const [v] = await tx.select().from(verifications).where(eq(verifications.id, verificationId)).for("update");
    if (!v) throw new DomainError("NOT_FOUND");
    if (v.status !== "pending") throw new DomainError("INVALID_TRANSITION");
    await tx
      .update(verifications)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        rejectionReason: decision === "reject" ? reason : null,
        reviewedBy: actor.userId,
        reviewedAt: now,
        cardObjectKey: null,
      })
      .where(eq(verifications.id, verificationId));
    await tx
      .update(profiles)
      .set({ verificationStatus: decision === "approve" ? "verified" : "rejected" })
      .where(eq(profiles.userId, v.userId));
    return v.cardObjectKey;
  });
  // La photo n'est plus utile une fois la décision prise (spec §9).
  if (key) await storage.delete(key).catch((e) => console.warn("[verification] photo non supprimée", key, e));
}
```

- [ ] **Step 4: Lancer**

Run: `npm run test:integration`
Expected: PASS (suites existantes et `verification.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth-identity.ts src/server/verification tests/integration/verification.test.ts
git commit -m "feat: service de vérification étudiante (email universitaire, carte, revue admin)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Écran de vérification de l'étudiant

**Files:**
- Create: `src/server/verification/actions.ts`, `src/components/email-verification-panel.tsx`, `src/components/card-form.tsx`, `src/app/etudiant/verification/page.tsx`
- Modify: `src/server/profiles/actions.ts`, `src/app/repas/[id]/page.tsx`, `next.config.ts`

**Interfaces:**
- Consumes: Task 4 (service), Task 3 (`getCardStorage`), Task 1 (`SCHOOLS`, `CARD_MAX_BYTES`, `CARD_FILE_MESSAGES`) ; `requireProfile`, `FormState`, `toFormState`, composants UI (Plan 1) ; `authClient` (Plan 1).
- Produces:
  - `confirmUniversityEmailAction(prev: FormState, fd: FormData): Promise<FormState>`
  - `submitStudentCardAction(prev: FormState, fd: FormData): Promise<FormState>`
  - `reviewCardAction(verificationId: string, decision: "approve" | "reject", prev: FormState, fd: FormData): Promise<FormState>` (utilisée en Task 6)
  - la route `/etudiant/verification`

- [ ] **Step 1: Vérifier l'API Email OTP du client Next**

Run: `grep -c "sendVerificationOtp" node_modules/@neondatabase/auth/dist/*.d.mts | grep -v ":0"`
Expected: au moins un fichier. Si `npx tsc --noEmit` rejette plus tard `authClient.emailOtp`, consulter `https://neon.com/docs/auth/guides/plugins/email-otp` et adapter l'appel. Les méthodes attendues sont `authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })` et `authClient.emailOtp.verifyEmail({ email, otp })`, toutes deux de forme `{ data, error }`.

- [ ] **Step 2: Autoriser des envois jusqu'à 4,4 Mo**

Dans `next.config.ts`, ajouter à l'objet de configuration :

```ts
  experimental: {
    // Photo de carte de 4 Mo maximum, avec la marge du multipart. Vercel plafonne le corps à 4,5 Mo.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
```

- [ ] **Step 3: Actions serveur**

`src/server/verification/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getCardStorage } from "@/services/storage";
import { toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { confirmUniversityEmail, reviewCard, submitStudentCard } from "./service";

export async function confirmUniversityEmailAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  try {
    await confirmUniversityEmail(getDb(), actor);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/etudiant/verification");
  revalidatePath("/repas");
  return { ok: true };
}

export async function submitStudentCardAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = { school: String(fd.get("school") ?? ""), studentNumber: String(fd.get("studentNumber") ?? "") };
  const entry = fd.get("card");
  const file = entry instanceof File ? entry : null;
  try {
    await submitStudentCard(getDb(), getCardStorage(), actor, values, {
      type: file?.type ?? "",
      size: file?.size ?? 0,
      bytes: file ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(),
    });
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/etudiant/verification");
  revalidatePath("/admin/verifications");
  return { ok: true };
}

export async function reviewCardAction(
  verificationId: string,
  decision: "approve" | "reject",
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("admin");
  if (decision !== "approve" && decision !== "reject") return { error: "Décision inconnue." };
  const values = { reason: String(fd.get("reason") ?? "") };
  try {
    await reviewCard(getDb(), getCardStorage(), actor, verificationId, decision, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/admin/verifications");
  return { ok: true };
}
```

- [ ] **Step 4: Panneau de vérification par email**

`src/components/email-verification-panel.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { confirmUniversityEmailAction } from "@/server/verification/actions";
import { Button, Input, Label } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function EmailVerificationPanel({ email, alreadyConfirmed }: { email: string; alreadyConfirmed: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"start" | "code">(alreadyConfirmed ? "code" : "start");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  async function confirmOnServer() {
    const result = await confirmUniversityEmailAction({}, new FormData());
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function sendCode() {
    setPending(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setPending(false);
    if (error) {
      setError("Impossible d'envoyer le code pour le moment. Réessayez dans quelques minutes.");
      return;
    }
    setInfo(`Un code à 6 chiffres vient d'être envoyé à ${email}. Pensez à vérifier vos spams.`);
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get("otp") ?? "").trim();
    setPending(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (error) {
      setPending(false);
      setError(
        error.code === "TOO_MANY_ATTEMPTS"
          ? "Trop d'essais. Demandez un nouveau code."
          : "Code incorrect ou expiré. Vérifiez-le ou demandez un nouveau code.",
      );
      return;
    }
    await confirmOnServer();
    setPending(false);
  }

  if (alreadyConfirmed) {
    return (
      <div className="space-y-3">
        <p className="text-stone-700">Votre adresse {email} est déjà confirmée.</p>
        <FormError message={error} />
        <Button type="button" disabled={pending} onClick={async () => { setPending(true); await confirmOnServer(); setPending(false); }}>
          Valider mon statut étudiant
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      {info && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{info}</p>}
      {step === "start" ? (
        <Button type="button" disabled={pending} onClick={sendCode}>
          {pending ? "Envoi…" : `Recevoir un code à ${email}`}
        </Button>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="otp">Code reçu par email</Label>
            <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Vérification…" : "Valider le code"}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={sendCode}>Renvoyer un code</Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Formulaire de carte**

`src/components/card-form.tsx` :

```tsx
"use client";

import { useActionState, useState } from "react";
import { SCHOOLS } from "@/config/schools";
import { CARD_FILE_MESSAGES, CARD_MAX_BYTES } from "@/domain/verification";
import { submitStudentCardAction } from "@/server/verification/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function CardForm() {
  const [state, action, pending] = useActionState(submitStudentCardAction, {});
  const [fileError, setFileError] = useState<string | undefined>();
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};

  if (state.ok) {
    return <p className="rounded-lg bg-green-50 p-3 text-green-800">Carte envoyée ! L'équipe Ocleans la vérifie au plus vite.</p>;
  }

  return (
    <form
      key={JSON.stringify(state.values ?? null)}
      action={action}
      onSubmit={(event) => {
        const file = (event.currentTarget.elements.namedItem("card") as HTMLInputElement).files?.[0];
        if (file && file.size > CARD_MAX_BYTES) {
          event.preventDefault();
          setFileError(CARD_FILE_MESSAGES.TOO_LARGE);
        }
      }}
      className="space-y-4"
    >
      <FormError message={state.error} />
      <div className="space-y-1.5">
        <Label htmlFor="school">Établissement</Label>
        <Select id="school" name="school" defaultValue={(v.school as string) ?? ""} required>
          <option value="">Choisir…</option>
          {SCHOOLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <FieldError errors={fe.school} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="studentNumber">Numéro étudiant</Label>
        <Input id="studentNumber" name="studentNumber" defaultValue={(v.studentNumber as string) ?? ""} autoComplete="off" required maxLength={30} />
        <FieldError errors={fe.studentNumber} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card">Photo de votre carte étudiante (JPEG, PNG ou HEIC, 4 Mo maximum)</Label>
        <Input id="card" name="card" type="file" accept="image/jpeg,image/png,image/heic,image/heif" required onChange={() => setFileError(undefined)} />
        <FieldError errors={fileError ? [fileError] : fe.card} />
      </div>
      <p className="rounded-lg bg-stone-100 p-3 text-xs text-stone-600">
        Votre photo sert uniquement à vérifier votre statut étudiant. Elle est stockée de façon privée, consultée par l'équipe Ocleans,
        puis supprimée dès la décision. Nous conservons seulement votre établissement, votre numéro étudiant et le résultat.
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer ma carte"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Page de vérification**

`src/app/etudiant/verification/page.tsx` :

```tsx
import { CardForm } from "@/components/card-form";
import { EmailVerificationPanel } from "@/components/email-verification-panel";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getDb } from "@/db/client";
import { getVerificationOverview } from "@/server/verification/service";
import { requireProfile } from "@/server/session";

export default async function VerificationPage() {
  const actor = await requireProfile("student");
  const overview = await getVerificationOverview(getDb(), actor);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Vérifier mon statut étudiant</h1>

      {overview.status === "verified" ? (
        <Card className="space-y-3">
          <Badge tone="green">Statut étudiant vérifié</Badge>
          <p>Vous pouvez demander à partager des repas.</p>
          <LinkButton href="/repas">Voir les repas</LinkButton>
        </Card>
      ) : overview.status === "pending" ? (
        <Card className="space-y-2">
          <Badge tone="amber">En cours de vérification</Badge>
          <p className="text-stone-700">Votre carte a bien été reçue. L'équipe Ocleans la vérifie au plus vite.</p>
        </Card>
      ) : (
        <>
          {overview.status === "rejected" && overview.latest?.rejectionReason && (
            <Card className="border-red-200 bg-red-50">
              <p className="text-red-800"><strong>Votre dernière demande a été refusée :</strong> {overview.latest.rejectionReason}</p>
              <p className="text-sm text-red-800">Vous pouvez envoyer une nouvelle demande ci-dessous.</p>
            </Card>
          )}

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Avec mon adresse universitaire</h2>
            {overview.email && overview.university ? (
              <EmailVerificationPanel email={overview.email} alreadyConfirmed={overview.emailVerified} />
            ) : (
              <p className="text-stone-600">
                Votre compte utilise l'adresse {overview.email ?? "inconnue"}, qui n'est pas une adresse étudiante reconnue
                (par exemple <strong>prenom.nom@etu.u-bordeaux.fr</strong>). Créez un compte avec votre adresse universitaire,
                ou utilisez votre carte étudiante ci-dessous.
              </p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">Avec ma carte étudiante</h2>
            <CardForm />
          </Card>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Orienter l'étudiant vers la vérification**

Dans `src/server/profiles/actions.ts`, remplacer `redirect(homeFor(role));` par :

```ts
  redirect(role === "student" ? "/etudiant/verification" : homeFor(role));
```

Dans `src/app/repas/[id]/page.tsx`, remplacer le paragraphe de la branche `viewer.verificationStatus !== "verified"` par :

```tsx
          <div className="space-y-2">
            <p className="text-stone-600">
              {viewer.verificationStatus === "pending"
                ? "Votre statut étudiant est en cours de vérification. Vous pourrez demander ce repas dès qu'il sera validé."
                : "Vérifiez votre statut étudiant pour demander à partager ce repas."}
            </p>
            {viewer.verificationStatus !== "pending" && <LinkButton href="/etudiant/verification">Vérifier mon statut</LinkButton>}
          </div>
```

Dans `src/components/site-header.tsx`, ajouter pour les étudiants non vérifiés, après le lien « Mes repas » :

```tsx
          {profile?.role === "student" && profile.verificationStatus !== "verified" && (
            <Link href="/etudiant/verification" className="font-medium text-orange-700">Vérification</Link>
          )}
```

- [ ] **Step 8: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe.

Vérification manuelle (`npm run dev` dans un terminal en arrière-plan, Playwright MCP) :
1. Seeder si nécessaire (`npm run seed:demo`), puis se connecter avec Chloé. Le compte de démo n'a pas de bouton rapide : se connecter avec l'email `chloe.demo@example.com` et le mot de passe `DEMO_PASSWORD`, à lire dans `.env.local` avec `grep`, sans l'afficher.
2. `/etudiant/verification` : le bloc email explique que `chloe.demo@example.com` n'est pas universitaire, et le formulaire de carte est visible.
3. Envoyer un numéro invalide (`12`) avec une petite image PNG (générer `scratchpad/carte.png` via `node -e` à partir d'un PNG 1×1 en base64) : message sur le numéro, établissement conservé.
4. Envoyer un numéro valide : « Carte envoyée ! ». En rechargeant, la page affiche « En cours de vérification », et la fiche d'un repas affiche le message d'attente.
5. Relancer `npm run seed:demo` pour remettre Chloé à `none`.

- [ ] **Step 9: Commit**

```bash
git add src next.config.ts
git commit -m "feat: écran de vérification étudiante (code par email, carte étudiante)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Écran admin des vérifications

**Files:**
- Create: `src/components/review-buttons.tsx`, `src/app/admin/verifications/page.tsx`
- Modify: `src/domain/routes.ts`, `src/domain/routes.test.ts`, `src/server/session.ts`, `src/components/site-header.tsx`

**Interfaces:**
- Consumes: `listPendingCards` (Task 4), `reviewCardAction` (Task 5), `getCardStorage` (Task 3).
- Produces: la route protégée `/admin/verifications` ; `homeFor("admin") === "/admin/verifications"`.

- [ ] **Step 1: Test des routes (échoue)**

Dans `src/domain/routes.test.ts`, ajouter au premier `it` :

```ts
    expect(isProtectedPath("/admin/verifications")).toBe(true);
```

et au second :

```ts
    expect(isProtectedPath("/administration")).toBe(false);
```

Run: `npm test -- src/domain/routes.test.ts`
Expected: FAIL sur `/admin/verifications`.

- [ ] **Step 2: Protéger `/admin` et orienter l'admin**

Dans `src/domain/routes.ts` : `const PROTECTED_PREFIXES = ["/etudiant", "/hote", "/admin", "/bienvenue"];`

Dans `src/server/session.ts`, `homeFor` devient :

```ts
export function homeFor(role: Role): string {
  if (role === "host") return "/hote/offres";
  if (role === "admin") return "/admin/verifications";
  return "/repas";
}
```

Dans `src/components/site-header.tsx`, après le lien hôte :

```tsx
          {profile?.role === "admin" && <Link href="/admin/verifications">Vérifications</Link>}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Boutons de décision**

`src/components/review-buttons.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { reviewCardAction } from "@/server/verification/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReviewButtons({ verificationId }: { verificationId: string }) {
  const [approveState, approve, approving] = useActionState(reviewCardAction.bind(null, verificationId, "approve"), {});
  const [rejectState, reject, rejecting] = useActionState(reviewCardAction.bind(null, verificationId, "reject"), {});
  const pending = approving || rejecting;
  return (
    <div className="space-y-3">
      <FormError message={approveState.error ?? rejectState.error} />
      <form action={approve}>
        <Button type="submit" disabled={pending} className="w-full">Valider la carte</Button>
      </form>
      <form action={reject} className="space-y-2">
        <Label htmlFor={`reason-${verificationId}`}>Motif du refus</Label>
        <Input id={`reason-${verificationId}`} name="reason" maxLength={300} placeholder="Ex. : photo illisible, carte expirée" />
        <FieldError errors={rejectState.fieldErrors?.reason} />
        <Button type="submit" variant="danger" disabled={pending} className="w-full">Refuser</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Page admin**

`src/app/admin/verifications/page.tsx` :

```tsx
import { ReviewButtons } from "@/components/review-buttons";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { getCardStorage } from "@/services/storage";
import { requireProfile } from "@/server/session";
import { listPendingCards } from "@/server/verification/service";

export default async function AdminVerificationsPage() {
  const actor = await requireProfile("admin");
  const cards = await listPendingCards(getDb(), getCardStorage(), actor);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Cartes étudiantes à vérifier ({cards.length})</h1>
      {cards.length === 0 && <p className="text-stone-600">Aucune carte en attente.</p>}
      {cards.map((card) => (
        <Card key={card.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{card.firstName}</h2>
            <p className="text-sm text-stone-600">
              {card.school} · n° {card.studentNumber} · envoyée {formatMealDate(card.createdAt)}
            </p>
          </div>
          {card.imageUrl ? (
            // URL signée de 5 minutes vers un bucket privé : next/image n'apporte rien ici.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt={`Carte étudiante de ${card.firstName}`} className="max-h-80 w-full rounded-lg border border-stone-200 object-contain" />
          ) : (
            <p className="text-sm text-red-700">Photo introuvable.</p>
          )}
          <ReviewButtons verificationId={card.id} />
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test && npm run test:integration`
Expected: tout passe.

Vérification manuelle (Playwright MCP, `npm run dev`) :
1. Connecté en Chloé, envoyer une carte comme en Task 5, étape 8.
2. Déconnexion, puis connexion rapide « Admin Ocleans » : arrivée sur `/admin/verifications`, avec la carte de Chloé et sa photo affichée.
3. « Refuser » sans motif : message sur le motif. Avec le motif « Photo illisible » : la carte disparaît de la liste.
4. Chloé voit le motif du refus et peut renvoyer une carte. L'admin la valide : Chloé voit « Statut étudiant vérifié », et le formulaire de demande apparaît sur la fiche d'un repas.
5. `run_sql` sur `demo` : `select card_object_key from verifications` ne renvoie que des `null`.
6. Relancer `npm run seed:demo`.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: écran admin de vérification des cartes étudiantes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Données de démo de vérification

**Files:**
- Modify: `scripts/seed-demo.ts`

**Interfaces:**
- Consumes: `createNeonStorage`, `storageConfigFromEnv` (Task 3) ; `verifications` (Task 2).
- Produces: après `npm run seed:demo`, la file admin contient une carte en attente (Thomas, Bordeaux INP) avec une image de démonstration, et les demandes antérieures des comptes de démo sont effacées, photos comprises.

- [ ] **Step 1: Ajouter Thomas et la carte de démo**

Dans `scripts/seed-demo.ts` :

1. Ajouter à `PEOPLE` :

```ts
  { key: "thomas", email: "thomas.demo@example.com", firstName: "Thomas", role: "student", school: "Bordeaux INP", verificationStatus: "pending" },
```

2. Ajouter aux imports : `verifications` depuis `../src/db/schema`, et `createNeonStorage, storageConfigFromEnv` depuis `../src/services/storage`.

3. Ajouter, après la boucle des profils dans `main()` :

```ts
  // Vérifications : on repart de zéro pour les comptes de démo, photos comprises.
  const storage = createNeonStorage(storageConfigFromEnv());
  const demoUserIds = [...ids.values()];
  const oldCards = await db
    .select({ key: verifications.cardObjectKey })
    .from(verifications)
    .where(inArray(verifications.userId, demoUserIds));
  for (const { key } of oldCards) if (key) await storage.delete(key).catch(() => {});
  await db.delete(verifications).where(inArray(verifications.userId, demoUserIds));

  const cardKey = `cards/${ids.get("thomas")}/demo-carte.svg`;
  await storage.put(cardKey, new TextEncoder().encode(DEMO_CARD_SVG), "image/svg+xml");
  await db.insert(verifications).values({
    userId: ids.get("thomas")!,
    method: "card",
    school: "Bordeaux INP",
    studentNumber: "21987654",
    cardObjectKey: cardKey,
  });
  await db
    .insert(verifications)
    .values({ userId: ids.get("lea")!, method: "card", school: "Université de Bordeaux", studentNumber: "21456789", status: "approved", reviewedAt: new Date() });
```

4. Ajouter la constante, au niveau du module :

```ts
// Fausse carte étudiante pour la démo (aucune donnée réelle).
const DEMO_CARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<rect width="640" height="400" rx="24" fill="#1e3a5f"/>
<text x="40" y="70" font-family="sans-serif" font-size="30" fill="#fff" font-weight="bold">CARTE ÉTUDIANTE — DÉMO</text>
<text x="40" y="120" font-family="sans-serif" font-size="22" fill="#cbd5e1">Bordeaux INP · 2026-2027</text>
<rect x="40" y="160" width="150" height="190" rx="12" fill="#cbd5e1"/>
<text x="230" y="210" font-family="sans-serif" font-size="26" fill="#fff">Thomas DÉMO</text>
<text x="230" y="260" font-family="sans-serif" font-size="22" fill="#cbd5e1">N° étudiant : 21987654</text>
<text x="230" y="330" font-family="sans-serif" font-size="16" fill="#f59e0b">Document fictif généré pour la démonstration</text>
</svg>`;
```

5. Mettre à jour la ligne finale : `console.log(\`Démo prête : ${PEOPLE.length} comptes, ${MEALS.length} repas, ${BOOKINGS.length} demandes, 1 carte à vérifier.\`);`

- [ ] **Step 2: Lancer deux fois**

Run: `npm run seed:demo && npm run seed:demo`
Expected: deux fois `Démo prête : 10 comptes, 15 repas, 8 demandes, 1 carte à vérifier.` Avec `run_sql` sur `demo`, `select method, status, count(*) from verifications group by 1, 2` renvoie `card / pending / 1` et `card / approved / 1`.

- [ ] **Step 3: Vérifier dans le navigateur**

Connexion rapide « Admin Ocleans » en local : la carte de Thomas s'affiche avec l'image de démonstration.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "feat: carte étudiante de démonstration dans la file admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Déploiement et recette

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: https://ocleans-demo.vercel.app à jour avec la vérification étudiante.

- [ ] **Step 1: Variables de stockage sur Vercel**

Pour `preview` et `development`, ajouter les cinq variables `NEON_STORAGE_*`. Lire chaque valeur avec `grep '^NOM=' .env.local | cut -d= -f2- | sed "s/^'//; s/'$//"`, jamais en sourçant le fichier, puis la passer avec `vercel env add NOM preview --value "$V" --sensitive --yes --force` (sans `--sensitive` pour `development`). Vérifier que `vercel env ls preview` liste les 10 variables.

- [ ] **Step 2: Déployer**

```bash
vercel deploy --target preview --yes
vercel alias set <url-affichée> ocleans-demo.vercel.app
```

- [ ] **Step 3: Recette dans le navigateur (Playwright MCP, viewport 390×844)**

Sur https://ocleans-demo.vercel.app :
1. Connexion rapide Admin : `/admin/verifications` affiche la carte de Thomas et son image.
2. Refuser sans motif : message. Puis valider : la liste est vide.
3. Inscription d'un nouveau compte `recette+<horodatage>@example.com` en tant qu'étudiant : arrivée sur `/etudiant/verification`, avec l'explication « adresse non reconnue » et le formulaire de carte.
4. Avec ce compte, choisir un fichier de plus de 4 Mo (générer `scratchpad/lourd.jpg` de 4,5 Mo, en-tête JPEG puis zéros) : message « La photo dépasse 4 Mo… » sans envoi. Puis une petite image : « Carte envoyée ! ».
5. L'admin voit la nouvelle carte et la refuse avec le motif « Recette » : l'étudiant voit le motif.
6. Nettoyage : supprimer le compte de recette (profil, demandes, puis `neon_auth."user"`, en ciblant son email), puis `npm run seed:demo`.

Le parcours « code par email » ne peut être testé de bout en bout qu'avec une vraie adresse `@etu.u-bordeaux.fr`. Le proposer à l'utilisateur s'il en a une ; sinon, le signaler comme non vérifié en conditions réelles.

- [ ] **Step 4: README**

Dans `README.md`, ajouter sous « Démarrer en local » :

````markdown
## Vérification étudiante

- Par **email universitaire** : l'étudiant crée son compte avec son adresse `@etu.u-bordeaux.fr` et reçoit un code envoyé par Neon Auth. Les domaines acceptés sont dans `src/config/university-domains.ts` : n'y ajouter qu'un domaine confirmé.
- Par **carte étudiante** : la photo (4 Mo maximum) est stockée dans le bucket privé `student-cards` de Neon Object Storage, puis supprimée dès que l'admin a tranché sur `/admin/verifications`.
- Variables : `NEON_STORAGE_*` (voir `.env.example`). Vérification du bucket : `npx tsx scripts/check-storage.ts`.
````

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: vérification étudiante dans le README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
