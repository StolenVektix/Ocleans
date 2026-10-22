# Ocleans — Plan 3a : annulation, messagerie, avis et signalements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ce plan ajoute les interactions qui suivent une réservation :
- l'hôte annule un repas, et l'étudiant annule sa venue, toujours avec un motif ;
- l'hôte et l'étudiant échangent des messages autour d'une réservation acceptée ;
- chacun laisse un avis sur l'autre après le repas, et les notes moyennes s'affichent ;
- chacun peut signaler un problème, et un admin classe le signalement ou suspend le compte visé.

**Architecture:** Mêmes conventions que les Plans 1 et 2 :
- Règles pures dans `src/domain/interactions.ts`.
- Services `(db, actor, …)` testés contre la branche Neon `test`.
- Server Actions minces, qui ne font qu'appeler les services.
- Un chargeur unique `loadBookingContext` fournit, pour une réservation, l'hôte, l'étudiant, le statut et le repas. Toutes les règles d'accès (annulation, messagerie, avis, signalement) s'appuient dessus.
- La messagerie se rafraîchit toutes les 5 secondes par `router.refresh()` côté client.

**Tech Stack:** Next.js 16, Neon Postgres + Drizzle, Zod 4, Vitest, Playwright MCP pour la recette.

**Spec:** `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md` (§3.2 D, E, F ; §6 règles 4, 6, 8, 9 ; §7)

**Série :** Plan 3a (ce plan) : F, D, E. Plan 3b : B (notifications dans l'application, emails en mode log) et C (carte).

**Décisions propres à ce plan :**
- Un signalement se fait **depuis une réservation** (mes repas, offres de l'hôte, conversation) et vise l'autre participant. L'application n'a pas de page de profil public.
- La suspension d'un compte annule ses repas à venir **et** ses demandes à venir. La spec, règle 9, ne mentionne que les repas ; libérer les places réservées par un étudiant suspendu va dans le même sens.
- `reviews.target_id` est stocké, bien qu'on puisse le déduire de la réservation, pour calculer les moyennes en une requête.
- Après une annulation, l'étudiant ne peut pas redemander le même repas : la règle « une demande par repas » s'applique toujours.

## Global Constraints

- Toutes les contraintes globales des Plans 1 et 2 restent valables : interface en français, Next.js 16, Drizzle sans `db.query.*`, aucun secret committé, et commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Les motifs d'annulation font de 3 à 300 caractères, après suppression des espaces aux extrémités.
- Un message fait de 1 à 1000 caractères. La conversation est lisible par les deux participants d'une réservation `accepted` ou `cancelled`. On ne peut y écrire que si la réservation est `accepted`, le repas `open`, l'auteur non suspendu, et moins de **7 jours** se sont écoulés depuis le début du repas.
- Un avis porte une note entière de 1 à 5 et un commentaire facultatif de 500 caractères au plus. Il n'est possible qu'après `starts_at`, sur une réservation `accepted`, une seule fois par auteur et par réservation (contrainte d'unicité).
- Un signalement contient un motif de 10 à 1000 caractères. Seul un admin actif peut classer un signalement ou suspendre un compte, et jamais le compte d'un admin.
- L'adresse exacte reste réservée à l'hôte et aux étudiants acceptés (règle 7). Aucune nouvelle requête ne l'expose.

## Review Focus

1. **Un hôte annule un repas avec des demandes en attente et acceptées** : toutes passent `cancelled`, avec son motif ; les demandes déjà refusées restent `declined`. L'étudiant voit « Annulée » et le motif, et le repas disparaît de la liste publique. Test en Task 3.
2. **Un étudiant accepté annule sa venue** : sa place se libère et l'hôte peut accepter une autre demande. Test en Task 3.
3. **Un message envoyé sur un repas annulé, ou 8 jours après le repas** : il est refusé avec « Cette conversation est fermée », sans rien écrire en base, et l'historique reste lisible. Test en Task 4.
4. **Double envoi d'un avis** (double-clic) : un seul avis est enregistré, et le second envoi reçoit « Vous avez déjà laissé un avis pour ce repas », jamais une erreur SQL brute. Test en Task 5.
5. **Suspension d'un hôte qui a des repas à venir** : ces repas et leurs demandes passent `cancelled`, ils disparaissent de la liste publique, et ses repas passés restent intacts. Test en Task 6 ; redirection vers `/compte-suspendu` vérifiée en Task 12.

---

## Structure des fichiers

```
src/domain/interactions.ts            règles : annulation, conversation, avis, signalement
src/domain/types.ts                   + REPORT_STATUSES, Rating
src/db/schema.ts                      + tables messages, reviews, reports
src/db/errors.ts                      isUniqueViolation
src/server/bookings/context.ts        loadBookingContext
src/server/meals/service.ts           + cancelMeal ; notes et capacité d'annulation dans les listes
src/server/bookings/service.ts        + cancelBooking ; actions possibles dans listStudentBookings
src/server/messages/service.ts        getThread, postMessage
src/server/reviews/service.ts         submitReview, getRatings, reviewedBookingIds, getReviewPrompt
src/server/reports/service.ts         createReport, getReportTarget, listOpenReports, resolveReport
src/server/*/actions.ts               Server Actions
src/components/cancel-form.tsx, rating-badge.tsx, thread-view.tsx, review-form.tsx, report-form.tsx, report-actions.tsx
src/app/messages/[id]/page.tsx, src/app/avis/[id]/page.tsx, src/app/signaler/[id]/page.tsx, src/app/admin/signalements/page.tsx
```

---

### Task 1: Règles d'interaction

**Files:**
- Create: `src/domain/interactions.ts`
- Modify: `src/domain/errors.ts`, `src/domain/types.ts`, `src/domain/dates.ts`
- Test: `src/domain/interactions.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Consumes: `Actor`, `MealState`, `assertActive` (`src/domain/bookings.ts`).
- Produces:
  - `REPORT_STATUSES = ["open", "handled"]`, `type ReportStatus`, `interface Rating { average: number; count: number }` (dans `types.ts`)
  - Nouveaux codes d'erreur : `REVIEW_TOO_EARLY`, `ALREADY_REVIEWED`, `REVIEW_NOT_ALLOWED`, `THREAD_CLOSED`
  - `MESSAGE_WINDOW_DAYS = 7`, `interface BookingContext { hostId: string; studentId: string; bookingStatus: BookingStatus; meal: MealState }`
  - `cancellationSchema` (Zod, `{ reason }`)
  - `participantRole(actor, ctx): "host" | "student" | null`, `otherParticipantId(actor, ctx): string`
  - `assertCanCancelMeal({ actor, meal, now })`, `canCancelMeal(args): boolean`
  - `assertCanCancelBooking({ actor, ctx, now })`, `canCancelBooking(args): boolean`
  - `canReadThread(actor, ctx): boolean`, `canWriteThread(actor, ctx, now): boolean`
  - `assertCanReview({ actor, ctx, alreadyReviewed, now })`, `canReview(args): boolean`
  - `assertCanReport({ actor, ctx })`
  - `formatMessageTime(date: Date): string` (dans `dates.ts`, ex. « 22 oct. à 19:05 »)

- [ ] **Step 1: Types et erreurs**

Ajouter à `src/domain/types.ts` :

```ts
export const REPORT_STATUSES = ["open", "handled"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface Rating {
  average: number;
  count: number;
}
```

Dans `src/domain/errors.ts`, ajouter à l'union :

```ts
  | "REVIEW_TOO_EARLY"
  | "ALREADY_REVIEWED"
  | "REVIEW_NOT_ALLOWED"
  | "THREAD_CLOSED";
```

et à `MESSAGES` :

```ts
  REVIEW_TOO_EARLY: "Vous pourrez laisser un avis une fois le repas passé.",
  ALREADY_REVIEWED: "Vous avez déjà laissé un avis pour ce repas.",
  REVIEW_NOT_ALLOWED: "Un avis n'est possible que pour un repas partagé ensemble.",
  THREAD_CLOSED: "Cette conversation est fermée.",
```

- [ ] **Step 2: Écrire les tests (échouent)**

`src/domain/interactions.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import type { Actor, MealState } from "./bookings";
import {
  assertCanCancelBooking,
  assertCanCancelMeal,
  assertCanReport,
  assertCanReview,
  canCancelBooking,
  canReadThread,
  canReview,
  canWriteThread,
  cancellationSchema,
  otherParticipantId,
  participantRole,
  type BookingContext,
} from "./interactions";

const DAY = 24 * 3600 * 1000;
const now = new Date("2026-10-22T10:00:00Z");
const host: Actor = { userId: "h1", role: "host", verificationStatus: "none", suspended: false };
const student: Actor = { userId: "s1", role: "student", verificationStatus: "verified", suspended: false };
const outsider: Actor = { userId: "x1", role: "student", verificationStatus: "verified", suspended: false };
const meal: MealState = { hostId: "h1", status: "open", startsAt: new Date(now.getTime() + 2 * DAY), seatsTotal: 2 };
const ctx: BookingContext = { hostId: "h1", studentId: "s1", bookingStatus: "accepted", meal };
const past = (days: number): BookingContext => ({ ...ctx, meal: { ...meal, startsAt: new Date(now.getTime() - days * DAY) } });

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
};

describe("participants", () => {
  it("identifie l'hôte, l'étudiant et l'autre participant", () => {
    expect(participantRole(host, ctx)).toBe("host");
    expect(participantRole(student, ctx)).toBe("student");
    expect(participantRole(outsider, ctx)).toBeNull();
    expect(otherParticipantId(host, ctx)).toBe("s1");
    expect(otherParticipantId(student, ctx)).toBe("h1");
  });
});

describe("cancellationSchema", () => {
  it("exige un motif de 3 à 300 caractères", () => {
    expect(cancellationSchema.parse({ reason: "  Imprévu  " }).reason).toBe("Imprévu");
    expect(cancellationSchema.safeParse({ reason: "ok" }).success).toBe(false);
    expect(cancellationSchema.safeParse({ reason: "x".repeat(301) }).success).toBe(false);
    expect(cancellationSchema.safeParse({}).success).toBe(false);
  });
});

describe("annulation", () => {
  it("laisse l'hôte annuler son repas à venir, pas un autre ni après le début", () => {
    expect(code(() => assertCanCancelMeal({ actor: host, meal, now }))).toBeNull();
    expect(code(() => assertCanCancelMeal({ actor: student, meal, now }))).toBe("FORBIDDEN");
    expect(code(() => assertCanCancelMeal({ actor: host, meal: { ...meal, status: "cancelled" }, now }))).toBe("MEAL_CANCELLED");
    expect(code(() => assertCanCancelMeal({ actor: host, meal: past(1).meal, now }))).toBe("MEAL_STARTED");
  });

  it("laisse l'étudiant annuler une demande en attente ou acceptée, avant le repas", () => {
    expect(code(() => assertCanCancelBooking({ actor: student, ctx, now }))).toBeNull();
    expect(canCancelBooking({ actor: student, ctx: { ...ctx, bookingStatus: "pending" }, now })).toBe(true);
    expect(code(() => assertCanCancelBooking({ actor: host, ctx, now }))).toBe("FORBIDDEN");
    expect(code(() => assertCanCancelBooking({ actor: student, ctx: { ...ctx, bookingStatus: "declined" }, now }))).toBe("INVALID_TRANSITION");
    expect(code(() => assertCanCancelBooking({ actor: student, ctx: past(1), now }))).toBe("MEAL_STARTED");
    expect(code(() => assertCanCancelBooking({ actor: { ...student, suspended: true }, ctx, now }))).toBe("SUSPENDED");
  });
});

describe("conversation", () => {
  it("est lisible par les participants d'une réservation acceptée ou annulée", () => {
    expect(canReadThread(student, ctx)).toBe(true);
    expect(canReadThread(host, { ...ctx, bookingStatus: "cancelled" })).toBe(true);
    expect(canReadThread(student, { ...ctx, bookingStatus: "pending" })).toBe(false);
    expect(canReadThread(outsider, ctx)).toBe(false);
  });

  it("n'est modifiable que sur une réservation acceptée, repas ouvert, jusqu'à 7 jours après", () => {
    expect(canWriteThread(student, ctx, now)).toBe(true);
    expect(canWriteThread(host, past(6), now)).toBe(true);
    expect(canWriteThread(host, past(8), now)).toBe(false);
    expect(canWriteThread(student, { ...ctx, bookingStatus: "cancelled" }, now)).toBe(false);
    expect(canWriteThread(student, { ...ctx, meal: { ...meal, status: "cancelled" } }, now)).toBe(false);
    expect(canWriteThread({ ...student, suspended: true }, ctx, now)).toBe(false);
    expect(canWriteThread(outsider, ctx, now)).toBe(false);
  });
});

describe("avis", () => {
  it("est possible après le repas, une fois, pour les participants d'une réservation acceptée", () => {
    expect(code(() => assertCanReview({ actor: student, ctx: past(1), alreadyReviewed: false, now }))).toBeNull();
    expect(code(() => assertCanReview({ actor: student, ctx, alreadyReviewed: false, now }))).toBe("REVIEW_TOO_EARLY");
    expect(code(() => assertCanReview({ actor: student, ctx: past(1), alreadyReviewed: true, now }))).toBe("ALREADY_REVIEWED");
    expect(code(() => assertCanReview({ actor: student, ctx: { ...past(1), bookingStatus: "declined" }, alreadyReviewed: false, now }))).toBe("REVIEW_NOT_ALLOWED");
    expect(code(() => assertCanReview({ actor: outsider, ctx: past(1), alreadyReviewed: false, now }))).toBe("FORBIDDEN");
    expect(canReview({ actor: host, ctx: past(1), alreadyReviewed: false, now })).toBe(true);
  });
});

describe("signalement", () => {
  it("est réservé aux participants actifs", () => {
    expect(code(() => assertCanReport({ actor: student, ctx: { ...ctx, bookingStatus: "pending" } }))).toBeNull();
    expect(code(() => assertCanReport({ actor: outsider, ctx }))).toBe("FORBIDDEN");
    expect(code(() => assertCanReport({ actor: { ...host, suspended: true }, ctx }))).toBe("SUSPENDED");
  });
});
```

Ajouter dans `src/domain/dates.test.ts` (et `formatMessageTime` dans l'import) :

```ts
describe("formatMessageTime", () => {
  it("affiche jour, mois abrégé et heure de Paris", () => {
    const text = formatMessageTime(new Date("2026-10-22T17:05:00Z"));
    expect(text).toContain("22");
    expect(text).toContain("oct");
    expect(text).toContain("19:05");
  });
});
```

Run: `npm test -- src/domain/interactions.test.ts src/domain/dates.test.ts`
Expected: FAIL (module `./interactions` et export `formatMessageTime` introuvables).

- [ ] **Step 3: Implémenter**

Ajouter à `src/domain/dates.ts` :

```ts
const messageFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMessageTime(date: Date): string {
  return messageFormatter.format(date);
}
```

`src/domain/interactions.ts` :

```ts
import { z } from "zod";
import { assertActive, type Actor, type MealState } from "./bookings";
import { DomainError } from "./errors";
import type { BookingStatus } from "./types";

export const MESSAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

export interface BookingContext {
  hostId: string;
  studentId: string;
  bookingStatus: BookingStatus;
  meal: MealState;
}

export const cancellationSchema = z.object({
  reason: z
    .string({ error: "Indiquez la raison de l'annulation" })
    .trim()
    .min(3, "Indiquez la raison de l'annulation (3 caractères minimum)")
    .max(300, "300 caractères maximum"),
});

function holds(check: () => void): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

const hasStarted = (meal: MealState, now: Date) => meal.startsAt.getTime() <= now.getTime();

export function participantRole(actor: Actor, ctx: BookingContext): "host" | "student" | null {
  if (actor.userId === ctx.hostId) return "host";
  if (actor.userId === ctx.studentId) return "student";
  return null;
}

export function otherParticipantId(actor: Actor, ctx: BookingContext): string {
  return actor.userId === ctx.hostId ? ctx.studentId : ctx.hostId;
}

export function assertCanCancelMeal(args: { actor: Actor; meal: MealState; now: Date }): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.meal.hostId) throw new DomainError("FORBIDDEN");
  if (args.meal.status === "cancelled") throw new DomainError("MEAL_CANCELLED");
  if (hasStarted(args.meal, args.now)) throw new DomainError("MEAL_STARTED");
}

export const canCancelMeal = (args: { actor: Actor; meal: MealState; now: Date }) => holds(() => assertCanCancelMeal(args));

export function assertCanCancelBooking(args: { actor: Actor; ctx: BookingContext; now: Date }): void {
  assertActive(args.actor);
  if (args.actor.userId !== args.ctx.studentId) throw new DomainError("FORBIDDEN");
  if (args.ctx.bookingStatus !== "pending" && args.ctx.bookingStatus !== "accepted") throw new DomainError("INVALID_TRANSITION");
  if (hasStarted(args.ctx.meal, args.now)) throw new DomainError("MEAL_STARTED");
}

export const canCancelBooking = (args: { actor: Actor; ctx: BookingContext; now: Date }) => holds(() => assertCanCancelBooking(args));

export function canReadThread(actor: Actor, ctx: BookingContext): boolean {
  return participantRole(actor, ctx) !== null && (ctx.bookingStatus === "accepted" || ctx.bookingStatus === "cancelled");
}

export function canWriteThread(actor: Actor, ctx: BookingContext, now: Date): boolean {
  return (
    participantRole(actor, ctx) !== null &&
    !actor.suspended &&
    ctx.bookingStatus === "accepted" &&
    ctx.meal.status === "open" &&
    now.getTime() < ctx.meal.startsAt.getTime() + MESSAGE_WINDOW_DAYS * DAY_MS
  );
}

export function assertCanReview(args: { actor: Actor; ctx: BookingContext; alreadyReviewed: boolean; now: Date }): void {
  assertActive(args.actor);
  if (participantRole(args.actor, args.ctx) === null) throw new DomainError("FORBIDDEN");
  if (args.ctx.bookingStatus !== "accepted") throw new DomainError("REVIEW_NOT_ALLOWED");
  if (!hasStarted(args.ctx.meal, args.now)) throw new DomainError("REVIEW_TOO_EARLY");
  if (args.alreadyReviewed) throw new DomainError("ALREADY_REVIEWED");
}

export const canReview = (args: { actor: Actor; ctx: BookingContext; alreadyReviewed: boolean; now: Date }) =>
  holds(() => assertCanReview(args));

export function assertCanReport(args: { actor: Actor; ctx: BookingContext }): void {
  assertActive(args.actor);
  if (participantRole(args.actor, args.ctx) === null) throw new DomainError("FORBIDDEN");
}
```

- [ ] **Step 4: Lancer**

Run: `npm test`
Expected: PASS (tous les tests unitaires).

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: règles d'annulation, de conversation, d'avis et de signalement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tables des messages, avis et signalements

**Files:**
- Modify: `src/db/schema.ts`, `tests/integration/helpers.ts`
- Create: `src/db/errors.ts`, `drizzle/0002_*.sql` (généré)
- Test: `tests/integration/schema.test.ts` (ajout d'un cas)

**Interfaces:**
- Consumes: `REPORT_STATUSES` (Task 1).
- Produces:
  - Tables `messages` (`id`, `bookingId`, `senderId`, `body`, `createdAt`), `reviews` (`id`, `bookingId`, `authorId`, `targetId`, `rating`, `comment`, timestamps ; unicité `(bookingId, authorId)`), `reports` (`id`, `reporterId`, `reportedUserId`, `bookingId` nullable, `reason`, `status`, `handledBy`, `handledAt`, timestamps)
  - `isUniqueViolation(error: unknown): boolean`
  - `resetDb()` vide aussi `messages`, `reviews` et `reports`

- [ ] **Step 1: Schéma**

Dans `src/db/schema.ts`, ajouter `REPORT_STATUSES` à l'import de `../domain/types`, puis, avant les exports de types :

```ts
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_booking_idx").on(t.bookingId, t.createdAt)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    ...timestamps(),
  },
  (t) => [unique("reviews_booking_author_unique").on(t.bookingId, t.authorId), index("reviews_target_idx").on(t.targetId)],
);

export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: reportStatusEnum("status").notNull().default("open"),
    handledBy: text("handled_by"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);
```

et :

```ts
export type Message = typeof messages.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Report = typeof reports.$inferSelect;
```

- [ ] **Step 2: Détection des violations d'unicité**

`src/db/errors.ts` :

```ts
// Postgres renvoie le code 23505 ; Drizzle peut l'envelopper dans `cause`.
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
```

- [ ] **Step 3: Migrations**

```bash
npm run db:generate && npm run db:migrate && npm run db:migrate:test
```

Expected: `drizzle/0002_*.sql` créé, et les deux migrations appliquées.

- [ ] **Step 4: Harnais**

Dans `tests/integration/helpers.ts`, la ligne `truncate` de `resetDb` devient :

```ts
  await db.execute(sql`truncate table reports, reviews, messages, verifications, bookings, meals, profiles, neon_auth."user" cascade`);
```

- [ ] **Step 5: Test du schéma**

Ajouter dans `tests/integration/schema.test.ts` (avec `reviews` dans l'import de `@/db/schema` et `isUniqueViolation` depuis `@/db/errors`) :

```ts
  it("n'accepte qu'un avis par auteur et par réservation, et l'erreur est reconnue", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    const review = { bookingId: booking.id, authorId: student.userId, targetId: host.userId, rating: 5 };
    await db.insert(reviews).values(review);
    const error = await db.insert(reviews).values(review).then(() => null, (e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error("autre"))).toBe(false);
  });
```

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db drizzle tests/integration
git commit -m "feat: tables des messages, avis et signalements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contexte de réservation et annulations

**Files:**
- Create: `src/server/bookings/context.ts`
- Modify: `src/server/meals/service.ts`, `src/server/bookings/service.ts`
- Test: `tests/integration/cancellations.test.ts`

**Interfaces:**
- Consumes: Task 1 (`BookingContext`, `cancellationSchema`, `assertCanCancelMeal`, `assertCanCancelBooking`) ; `Tx` (`src/server/meals/service.ts`).
- Produces:
  - `interface BookingContextRow extends BookingContext { bookingId: string; mealId: string; mealTitle: string; hostFirstName: string; studentFirstName: string }`
  - `loadBookingContext(db: Db | Tx, bookingId: string): Promise<BookingContextRow | null>` (`null` si l'id est invalide ou inconnu)
  - `cancelMeal(db, actor, mealId, raw: { reason?: unknown }, now?): Promise<void>`
  - `cancelBooking(db, actor, bookingId, raw: { reason?: unknown }, now?): Promise<void>`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/cancellations.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals } from "@/db/schema";
import { loadBookingContext } from "@/server/bookings/context";
import { cancelBooking, decideBooking, requestBooking } from "@/server/bookings/service";
import { cancelMeal, getMealForViewer, listUpcomingMeals } from "@/server/meals/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("loadBookingContext", () => {
  it("rassemble hôte, étudiant, statut et repas, ou renvoie null", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile({ firstName: "Léa" });
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    expect(await loadBookingContext(db, booking.id)).toMatchObject({
      bookingId: booking.id,
      hostId: host.userId,
      studentId: student.userId,
      bookingStatus: "accepted",
      mealTitle: "Gratin dauphinois",
      hostFirstName: "Mireille",
      studentFirstName: "Léa",
      meal: { hostId: host.userId, status: "open", seatsTotal: 2 },
    });
    expect(await loadBookingContext(db, "abc")).toBeNull();
    expect(await loadBookingContext(db, crypto.randomUUID())).toBeNull();
  });
});

describe("cancelMeal", () => {
  it("annule le repas et ses demandes en attente ou acceptées, avec le motif", async () => {
    const host = await makeProfile({ role: "host" });
    const [s1, s2, s3] = [await makeProfile(), await makeProfile(), await makeProfile()];
    const meal = await makeMeal(host.userId, { seatsTotal: 3 });
    const accepted = await makeBooking(meal.id, s1.userId, "accepted");
    const pending = await makeBooking(meal.id, s2.userId, "pending");
    const declined = await makeBooking(meal.id, s3.userId, "declined");
    await cancelMeal(db, host, meal.id, { reason: "  Imprévu familial " });
    const [m] = await db.select().from(meals).where(eq(meals.id, meal.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: "Imprévu familial" });
    const rows = Object.fromEntries((await db.select().from(bookings)).map((b) => [b.id, b]));
    expect(rows[accepted.id]).toMatchObject({ status: "cancelled", cancelledBy: host.userId, cancelReason: "Imprévu familial" });
    expect(rows[pending.id].status).toBe("cancelled");
    expect(rows[declined.id].status).toBe("declined");
    expect(await listUpcomingMeals(db, {})).toHaveLength(0);
  });

  it("refuse sans motif, par un autre hôte, sur un repas commencé ou déjà annulé", async () => {
    const host = await makeProfile({ role: "host" });
    const other = await makeProfile({ role: "host" });
    const meal = await makeMeal(host.userId);
    const started = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    await expect(cancelMeal(db, host, meal.id, { reason: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(cancelMeal(db, other, meal.id, { reason: "Pas à moi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelMeal(db, host, started.id, { reason: "Trop tard" })).rejects.toMatchObject({ code: "MEAL_STARTED" });
    await cancelMeal(db, host, meal.id, { reason: "Imprévu" });
    await expect(cancelMeal(db, host, meal.id, { reason: "Encore" })).rejects.toMatchObject({ code: "MEAL_CANCELLED" });
    await expect(cancelMeal(db, host, "abc", { reason: "Imprévu" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cancelBooking", () => {
  it("libère la place d'un étudiant accepté, que l'hôte peut redonner", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 1 });
    const b1 = await makeBooking(meal.id, s1.userId, "accepted");
    const b2 = await makeBooking(meal.id, s2.userId, "pending");
    await cancelBooking(db, s1, b1.id, { reason: "Partiel déplacé" });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, b1.id));
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: s1.userId, cancelReason: "Partiel déplacé" });
    expect((await getMealForViewer(db, null, meal.id))?.seatsLeft).toBe(1);
    await expect(decideBooking(db, host, b2.id, "accept")).resolves.toEqual({ status: "accepted" });
  });

  it("refuse l'hôte, un autre étudiant, une demande refusée, un repas commencé", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const other = await makeProfile();
    const meal = await makeMeal(host.userId);
    const started = await makeMeal(host.userId, { startsAt: new Date(Date.now() - 3600_000) });
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    const declined = await makeBooking((await makeMeal(host.userId)).id, student.userId, "declined");
    const late = await makeBooking(started.id, student.userId, "accepted");
    await expect(cancelBooking(db, host, booking.id, { reason: "Non" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelBooking(db, other, booking.id, { reason: "Non" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelBooking(db, student, declined.id, { reason: "Tant pis" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(cancelBooking(db, student, late.id, { reason: "Trop tard" })).rejects.toMatchObject({ code: "MEAL_STARTED" });
  });

  it("n'autorise pas une nouvelle demande pour le même repas", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "pending");
    await cancelBooking(db, student, booking.id, { reason: "Changement de plan" });
    await expect(requestBooking(db, student, meal.id, {})).rejects.toMatchObject({ code: "ALREADY_REQUESTED" });
  });
});
```

Run: `npm run test:integration -- tests/integration/cancellations.test.ts`
Expected: FAIL (module `@/server/bookings/context` introuvable).

- [ ] **Step 2: Chargeur de contexte**

`src/server/bookings/context.ts` :

```ts
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { bookings, meals, profiles } from "@/db/schema";
import { isUuid } from "@/domain/ids";
import type { BookingContext } from "@/domain/interactions";
import type { Tx } from "@/server/meals/service";

export interface BookingContextRow extends BookingContext {
  bookingId: string;
  mealId: string;
  mealTitle: string;
  hostFirstName: string;
  studentFirstName: string;
}

const hostProfile = alias(profiles, "host_profile");
const studentProfile = alias(profiles, "student_profile");

export async function loadBookingContext(db: Db | Tx, bookingId: string): Promise<BookingContextRow | null> {
  if (!isUuid(bookingId)) return null;
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingStatus: bookings.status,
      studentId: bookings.studentId,
      mealId: meals.id,
      mealTitle: meals.title,
      hostId: meals.hostId,
      mealStatus: meals.status,
      startsAt: meals.startsAt,
      seatsTotal: meals.seatsTotal,
      hostFirstName: hostProfile.firstName,
      studentFirstName: studentProfile.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(hostProfile, eq(hostProfile.userId, meals.hostId))
    .innerJoin(studentProfile, eq(studentProfile.userId, bookings.studentId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    bookingId: row.bookingId,
    bookingStatus: row.bookingStatus,
    studentId: row.studentId,
    hostId: row.hostId,
    mealId: row.mealId,
    mealTitle: row.mealTitle,
    hostFirstName: row.hostFirstName,
    studentFirstName: row.studentFirstName,
    meal: { hostId: row.hostId, status: row.mealStatus, startsAt: row.startsAt, seatsTotal: row.seatsTotal },
  };
}
```

- [ ] **Step 3: `cancelMeal`**

Dans `src/server/meals/service.ts`, ajouter aux imports `assertCanCancelMeal` et `cancellationSchema` depuis `@/domain/interactions`, puis :

```ts
export async function cancelMeal(db: Db, actor: Actor, mealId: string, raw: { reason?: unknown }, now = new Date()): Promise<void> {
  const { reason } = cancellationSchema.parse(raw);
  if (!isUuid(mealId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [meal] = await tx.select().from(meals).where(eq(meals.id, mealId)).for("update");
    if (!meal) throw new DomainError("NOT_FOUND");
    assertCanCancelMeal({ actor, meal, now });
    await tx.update(meals).set({ status: "cancelled", cancelReason: reason }).where(eq(meals.id, mealId));
    // Règle 4 : toutes les demandes encore actives suivent l'annulation du repas.
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: reason })
      .where(and(eq(bookings.mealId, mealId), inArray(bookings.status, ["pending", "accepted"])));
  });
}
```

- [ ] **Step 4: `cancelBooking`**

Dans `src/server/bookings/service.ts`, ajouter aux imports `assertCanCancelBooking` et `cancellationSchema` depuis `@/domain/interactions`, et `loadBookingContext` depuis `./context`, puis :

```ts
export async function cancelBooking(db: Db, actor: Actor, bookingId: string, raw: { reason?: unknown }, now = new Date()): Promise<void> {
  const { reason } = cancellationSchema.parse(raw);
  if (!isUuid(bookingId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    // Verrou sur le repas, comme pour les acceptations : la place libérée ne peut pas être comptée deux fois.
    const [locked] = await tx.select({ mealId: bookings.mealId }).from(bookings).where(eq(bookings.id, bookingId));
    if (!locked) throw new DomainError("NOT_FOUND");
    await tx.select({ id: meals.id }).from(meals).where(eq(meals.id, locked.mealId)).for("update");
    const ctx = await loadBookingContext(tx, bookingId);
    if (!ctx) throw new DomainError("NOT_FOUND");
    assertCanCancelBooking({ actor, ctx, now });
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: reason })
      .where(eq(bookings.id, bookingId));
  });
}
```

- [ ] **Step 5: Lancer**

Run: `npm run test:integration`
Expected: PASS (toutes les suites).

- [ ] **Step 6: Commit**

```bash
git add src/server tests/integration/cancellations.test.ts
git commit -m "feat: annulation d'un repas par l'hôte et d'une venue par l'étudiant

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Service de messagerie

**Files:**
- Create: `src/server/messages/service.ts`
- Test: `tests/integration/messages.test.ts`

**Interfaces:**
- Consumes: `loadBookingContext` (Task 3) ; `canReadThread`, `canWriteThread` (Task 1) ; `messages` (Task 2).
- Produces:
  - `interface ThreadMessage { id: string; body: string; createdAt: Date; mine: boolean; senderFirstName: string }`
  - `interface Thread { bookingId: string; mealId: string; mealTitle: string; mealStartsAt: Date; otherFirstName: string; canWrite: boolean; messages: ThreadMessage[] }`
  - `getThread(db, actor, bookingId, now?): Promise<Thread | null>` (`null` si l'acteur ne peut pas lire)
  - `postMessage(db, actor, bookingId, raw: { body?: unknown }, now?): Promise<void>`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/messages.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { messages } from "@/db/schema";
import { cancelBooking } from "@/server/bookings/service";
import { getThread, postMessage } from "@/server/messages/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function acceptedBooking(mealOverrides: Parameters<typeof makeMeal>[1] = {}) {
  const host = await makeProfile({ role: "host", firstName: "Mireille" });
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(host.userId, mealOverrides);
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { host, student, meal, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("messagerie", () => {
  it("permet aux deux participants d'échanger, dans l'ordre, et cache tout à un tiers", async () => {
    const { host, student, booking } = await acceptedBooking();
    await postMessage(db, student, booking.id, { body: "  Bonjour Mireille ! " });
    await postMessage(db, host, booking.id, { body: "Bienvenue Léa" });
    const thread = await getThread(db, student, booking.id);
    expect(thread).toMatchObject({ otherFirstName: "Mireille", mealTitle: "Gratin dauphinois", canWrite: true });
    expect(thread?.messages.map((m) => [m.body, m.mine, m.senderFirstName])).toEqual([
      ["Bonjour Mireille !", true, "Léa"],
      ["Bienvenue Léa", false, "Mireille"],
    ]);
    const outsider = await makeProfile();
    expect(await getThread(db, outsider, booking.id)).toBeNull();
    await expect(postMessage(db, outsider, booking.id, { body: "Coucou" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getThread(db, student, "abc")).toBeNull();
  });

  it("n'ouvre pas de conversation sur une demande en attente", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "pending");
    expect(await getThread(db, student, booking.id)).toBeNull();
    await expect(postMessage(db, student, booking.id, { body: "Bonjour" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passe en lecture seule après une annulation, historique conservé", async () => {
    const { student, booking } = await acceptedBooking();
    await postMessage(db, student, booking.id, { body: "À samedi !" });
    await cancelBooking(db, student, booking.id, { reason: "Malade" });
    const thread = await getThread(db, student, booking.id);
    expect(thread?.canWrite).toBe(false);
    expect(thread?.messages).toHaveLength(1);
    await expect(postMessage(db, student, booking.id, { body: "Désolée" })).rejects.toMatchObject({ code: "THREAD_CLOSED" });
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("reste ouverte 7 jours après le repas, puis se ferme", async () => {
    const recent = await acceptedBooking({ startsAt: new Date(Date.now() - 6 * DAY) });
    expect((await getThread(db, recent.student, recent.booking.id))?.canWrite).toBe(true);
    const old = await acceptedBooking({ startsAt: new Date(Date.now() - 8 * DAY) });
    expect((await getThread(db, old.host, old.booking.id))?.canWrite).toBe(false);
    await expect(postMessage(db, old.host, old.booking.id, { body: "Merci encore" })).rejects.toMatchObject({ code: "THREAD_CLOSED" });
  });

  it("refuse un message vide ou trop long", async () => {
    const { student, booking } = await acceptedBooking();
    await expect(postMessage(db, student, booking.id, { body: "   " })).rejects.toBeInstanceOf(ZodError);
    await expect(postMessage(db, student, booking.id, { body: "x".repeat(1001) })).rejects.toBeInstanceOf(ZodError);
  });
});
```

Run: `npm run test:integration -- tests/integration/messages.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/server/messages/service.ts` :

```ts
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { messages, profiles } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { canReadThread, canWriteThread, participantRole } from "@/domain/interactions";
import { loadBookingContext } from "@/server/bookings/context";

const messageSchema = z.object({
  body: z.string({ error: "Écrivez un message" }).trim().min(1, "Écrivez un message").max(1000, "1000 caractères maximum"),
});

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: Date;
  mine: boolean;
  senderFirstName: string;
}

export interface Thread {
  bookingId: string;
  mealId: string;
  mealTitle: string;
  mealStartsAt: Date;
  otherFirstName: string;
  canWrite: boolean;
  messages: ThreadMessage[];
}

export async function getThread(db: Db, actor: Actor, bookingId: string, now = new Date()): Promise<Thread | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || !canReadThread(actor, ctx)) return null;
  const rows = await db
    .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId, senderFirstName: profiles.firstName })
    .from(messages)
    .innerJoin(profiles, eq(profiles.userId, messages.senderId))
    .where(eq(messages.bookingId, bookingId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return {
    bookingId: ctx.bookingId,
    mealId: ctx.mealId,
    mealTitle: ctx.mealTitle,
    mealStartsAt: ctx.meal.startsAt,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
    canWrite: canWriteThread(actor, ctx, now),
    messages: rows.map(({ senderId, ...m }) => ({ ...m, mine: senderId === actor.userId })),
  };
}

export async function postMessage(db: Db, actor: Actor, bookingId: string, raw: { body?: unknown }, now = new Date()): Promise<void> {
  const { body } = messageSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  if (!canReadThread(actor, ctx)) throw new DomainError("FORBIDDEN");
  if (!canWriteThread(actor, ctx, now)) throw new DomainError("THREAD_CLOSED");
  await db.insert(messages).values({ bookingId, senderId: actor.userId, body });
}
```

- [ ] **Step 3: Lancer**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/messages tests/integration/messages.test.ts
git commit -m "feat: messagerie entre hôte et étudiant autour d'une réservation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Service des avis et des notes

**Files:**
- Create: `src/server/reviews/service.ts`
- Test: `tests/integration/reviews.test.ts`

**Interfaces:**
- Consumes: `loadBookingContext` (Task 3) ; `assertCanReview`, `otherParticipantId`, `participantRole` (Task 1) ; `reviews` et `isUniqueViolation` (Task 2) ; `Rating` (Task 1).
- Produces:
  - `submitReview(db, actor, bookingId, raw: { rating?: unknown; comment?: unknown }, now?): Promise<void>`
  - `getRatings(db, userIds: string[]): Promise<Map<string, Rating>>` (moyenne arrondie à 0,1)
  - `reviewedBookingIds(db, authorId: string, bookingIds: string[]): Promise<Set<string>>`
  - `interface ReviewPrompt { bookingId: string; mealTitle: string; otherFirstName: string; allowed: boolean; reason: string | null }`
  - `getReviewPrompt(db, actor, bookingId, now?): Promise<ReviewPrompt | null>` (`null` pour un non-participant)

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/reviews.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { reviews } from "@/db/schema";
import { getRatings, getReviewPrompt, reviewedBookingIds, submitReview } from "@/server/reviews/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function pastBooking(host?: Awaited<ReturnType<typeof makeProfile>>) {
  const h = host ?? (await makeProfile({ role: "host", firstName: "Mireille" }));
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(h.userId, { startsAt: new Date(Date.now() - DAY) });
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { host: h, student, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("submitReview", () => {
  it("permet à chacun de noter l'autre une fois après le repas", async () => {
    const { host, student, booking } = await pastBooking();
    await submitReview(db, student, booking.id, { rating: "5", comment: " Super soirée " });
    await submitReview(db, host, booking.id, { rating: "4" });
    const rows = await db.select().from(reviews);
    expect(rows.find((r) => r.authorId === student.userId)).toMatchObject({ targetId: host.userId, rating: 5, comment: "Super soirée" });
    expect(rows.find((r) => r.authorId === host.userId)).toMatchObject({ targetId: student.userId, rating: 4, comment: "" });
    await expect(submitReview(db, student, booking.id, { rating: "3" })).rejects.toMatchObject({ code: "ALREADY_REVIEWED" });
    expect(await reviewedBookingIds(db, student.userId, [booking.id])).toEqual(new Set([booking.id]));
  });

  it("refuse avant le repas, sur une demande non acceptée et pour un tiers", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const future = await makeBooking((await makeMeal(host.userId)).id, student.userId, "accepted");
    const declined = await makeBooking((await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) })).id, student.userId, "declined");
    await expect(submitReview(db, student, future.id, { rating: "5" })).rejects.toMatchObject({ code: "REVIEW_TOO_EARLY" });
    await expect(submitReview(db, student, declined.id, { rating: "5" })).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED" });
    const { booking } = await pastBooking();
    await expect(submitReview(db, student, booking.id, { rating: "5" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(submitReview(db, student, "abc", { rating: "5" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("n'enregistre qu'un avis en cas de double envoi simultané", async () => {
    const { student, booking } = await pastBooking();
    const results = await Promise.allSettled([
      submitReview(db, student, booking.id, { rating: "5" }),
      submitReview(db, student, booking.id, { rating: "5" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ALREADY_REVIEWED" });
    expect(await db.select().from(reviews)).toHaveLength(1);
  });

  it("refuse une note hors de 1 à 5 ou un commentaire trop long", async () => {
    const { student, booking } = await pastBooking();
    await expect(submitReview(db, student, booking.id, { rating: "0" })).rejects.toBeInstanceOf(ZodError);
    await expect(submitReview(db, student, booking.id, { rating: "6" })).rejects.toBeInstanceOf(ZodError);
    await expect(submitReview(db, student, booking.id, { rating: "4", comment: "x".repeat(501) })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("getRatings", () => {
  it("calcule la moyenne et le nombre d'avis reçus", async () => {
    const first = await pastBooking();
    const second = await pastBooking(first.host);
    await submitReview(db, first.student, first.booking.id, { rating: "5" });
    await submitReview(db, second.student, second.booking.id, { rating: "4" });
    const ratings = await getRatings(db, [first.host.userId, first.student.userId]);
    expect(ratings.get(first.host.userId)).toEqual({ average: 4.5, count: 2 });
    expect(ratings.has(first.student.userId)).toBe(false);
    expect((await getRatings(db, [])).size).toBe(0);
  });
});

describe("getReviewPrompt", () => {
  it("explique pourquoi l'avis n'est pas encore possible", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile();
    const future = await makeBooking((await makeMeal(host.userId)).id, student.userId, "accepted");
    expect(await getReviewPrompt(db, student, future.id)).toMatchObject({
      otherFirstName: "Mireille",
      allowed: false,
      reason: "Vous pourrez laisser un avis une fois le repas passé.",
    });
    const { booking } = await pastBooking();
    expect(await getReviewPrompt(db, student, booking.id)).toBeNull();
  });
});
```

Run: `npm run test:integration -- tests/integration/reviews.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/server/reviews/service.ts` :

```ts
import { and, avg, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { reviews } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { assertCanReview, otherParticipantId, participantRole } from "@/domain/interactions";
import type { Rating } from "@/domain/types";
import { loadBookingContext } from "@/server/bookings/context";

const reviewSchema = z.object({
  rating: z.coerce
    .number({ error: "Choisissez une note" })
    .int("Choisissez une note")
    .min(1, "Choisissez une note de 1 à 5")
    .max(5, "Choisissez une note de 1 à 5"),
  comment: z.string().trim().max(500, "500 caractères maximum").default(""),
});

export interface ReviewPrompt {
  bookingId: string;
  mealTitle: string;
  otherFirstName: string;
  allowed: boolean;
  reason: string | null;
}

async function hasReviewed(db: Db, authorId: string, bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.bookingId, bookingId), eq(reviews.authorId, authorId)))
    .limit(1);
  return Boolean(row);
}

export async function submitReview(
  db: Db,
  actor: Actor,
  bookingId: string,
  raw: { rating?: unknown; comment?: unknown },
  now = new Date(),
): Promise<void> {
  const input = reviewSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  assertCanReview({ actor, ctx, alreadyReviewed: await hasReviewed(db, actor.userId, bookingId), now });
  try {
    await db.insert(reviews).values({
      bookingId,
      authorId: actor.userId,
      targetId: otherParticipantId(actor, ctx),
      rating: input.rating,
      comment: input.comment,
    });
  } catch (error) {
    // Double envoi simultané : la contrainte d'unicité tranche.
    if (isUniqueViolation(error)) throw new DomainError("ALREADY_REVIEWED");
    throw error;
  }
}

export async function getRatings(db: Db, userIds: string[]): Promise<Map<string, Rating>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ targetId: reviews.targetId, average: avg(reviews.rating), count: count() })
    .from(reviews)
    .where(inArray(reviews.targetId, [...new Set(userIds)]))
    .groupBy(reviews.targetId);
  return new Map(rows.map((r) => [r.targetId, { average: Math.round(Number(r.average) * 10) / 10, count: Number(r.count) }]));
}

export async function reviewedBookingIds(db: Db, authorId: string, bookingIds: string[]): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();
  const rows = await db
    .select({ bookingId: reviews.bookingId })
    .from(reviews)
    .where(and(eq(reviews.authorId, authorId), inArray(reviews.bookingId, bookingIds)));
  return new Set(rows.map((r) => r.bookingId));
}

export async function getReviewPrompt(db: Db, actor: Actor, bookingId: string, now = new Date()): Promise<ReviewPrompt | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || participantRole(actor, ctx) === null) return null;
  let reason: string | null = null;
  try {
    assertCanReview({ actor, ctx, alreadyReviewed: await hasReviewed(db, actor.userId, bookingId), now });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    reason = error.message;
  }
  return {
    bookingId: ctx.bookingId,
    mealTitle: ctx.mealTitle,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
    allowed: reason === null,
    reason,
  };
}
```

- [ ] **Step 3: Lancer**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/reviews tests/integration/reviews.test.ts
git commit -m "feat: avis après le repas et notes moyennes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Signalements et suspension

**Files:**
- Create: `src/server/reports/service.ts`
- Test: `tests/integration/reports.test.ts`

**Interfaces:**
- Consumes: `loadBookingContext` (Task 3) ; `assertCanReport`, `otherParticipantId`, `participantRole` (Task 1) ; `assertIsAdmin` (Plan 2) ; `reports` (Task 2) ; `Tx`.
- Produces:
  - `createReport(db, actor, bookingId, raw: { reason?: unknown }): Promise<{ id: string }>`
  - `interface ReportTarget { bookingId: string; mealTitle: string; otherFirstName: string }`
  - `getReportTarget(db, actor, bookingId): Promise<ReportTarget | null>`
  - `interface OpenReport { id: string; reason: string; createdAt: Date; reporterFirstName: string; reportedUserId: string; reportedFirstName: string; reportedRole: Role; reportedSuspended: boolean; mealTitle: string | null }`
  - `listOpenReports(db, actor): Promise<OpenReport[]>`
  - `resolveReport(db, actor, reportId, decision: "dismiss" | "suspend", now?): Promise<void>`
  - `SUSPENSION_REASON = "Compte suspendu par l'équipe Ocleans"`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/reports.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { bookings, meals, profiles, reports } from "@/db/schema";
import { listUpcomingMeals } from "@/server/meals/service";
import { createReport, getReportTarget, listOpenReports, resolveReport, SUSPENSION_REASON } from "@/server/reports/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

async function setup() {
  const admin = await makeProfile({ role: "admin", firstName: "Admin" });
  const host = await makeProfile({ role: "host", firstName: "Mireille" });
  const student = await makeProfile({ firstName: "Léa" });
  const meal = await makeMeal(host.userId, { title: "Pot-au-feu" });
  const booking = await makeBooking(meal.id, student.userId, "accepted");
  return { admin, host, student, meal, booking };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("createReport", () => {
  it("enregistre un signalement d'un participant contre l'autre, visible par l'admin", async () => {
    const { admin, host, student, booking } = await setup();
    expect(await getReportTarget(db, student, booking.id)).toMatchObject({ otherFirstName: "Mireille", mealTitle: "Pot-au-feu" });
    await createReport(db, student, booking.id, { reason: "  Propos déplacés pendant le repas " });
    const list = await listOpenReports(db, admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      reason: "Propos déplacés pendant le repas",
      reporterFirstName: "Léa",
      reportedUserId: host.userId,
      reportedFirstName: "Mireille",
      reportedRole: "host",
      reportedSuspended: false,
      mealTitle: "Pot-au-feu",
    });
  });

  it("refuse un tiers et un motif trop court, et réserve la liste aux admins", async () => {
    const { student, booking } = await setup();
    const outsider = await makeProfile();
    expect(await getReportTarget(db, outsider, booking.id)).toBeNull();
    await expect(createReport(db, outsider, booking.id, { reason: "Je n'étais pas là" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createReport(db, student, booking.id, { reason: "Bof" })).rejects.toBeInstanceOf(ZodError);
    await expect(listOpenReports(db, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("resolveReport", () => {
  it("classe un signalement sans suspendre", async () => {
    const { admin, host, student, booking } = await setup();
    const { id } = await createReport(db, student, booking.id, { reason: "Retard de vingt minutes" });
    await resolveReport(db, admin, id, "dismiss");
    const [r] = await db.select().from(reports).where(eq(reports.id, id));
    expect(r).toMatchObject({ status: "handled", handledBy: admin.userId });
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p.suspended).toBe(false);
    expect(await listOpenReports(db, admin)).toHaveLength(0);
  });

  it("suspend un hôte : ses repas à venir et leurs demandes sont annulés, ses repas passés restent", async () => {
    const { admin, host, student, meal, booking } = await setup();
    const pastMeal = await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) });
    const pastBooking = await makeBooking(pastMeal.id, student.userId, "accepted");
    const { id } = await createReport(db, student, booking.id, { reason: "Comportement inacceptable" });
    await resolveReport(db, admin, id, "suspend");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, host.userId));
    expect(p.suspended).toBe(true);
    const [m] = await db.select().from(meals).where(eq(meals.id, meal.id));
    expect(m).toMatchObject({ status: "cancelled", cancelReason: SUSPENSION_REASON });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: SUSPENSION_REASON });
    const [pm] = await db.select().from(meals).where(eq(meals.id, pastMeal.id));
    expect(pm.status).toBe("open");
    const [pb] = await db.select().from(bookings).where(eq(bookings.id, pastBooking.id));
    expect(pb.status).toBe("accepted");
    expect(await listUpcomingMeals(db, {})).toHaveLength(0);
  });

  it("suspend un étudiant : ses demandes à venir sont annulées", async () => {
    const { admin, host, student, booking } = await setup();
    const { id } = await createReport(db, host, booking.id, { reason: "Ne s'est jamais présenté" });
    await resolveReport(db, admin, id, "suspend");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("cancelled");
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, student.userId));
    expect(p.suspended).toBe(true);
  });

  it("ne traite qu'une fois un signalement, refuse un non-admin et la suspension d'un admin", async () => {
    const { admin, student, booking } = await setup();
    const other = await makeProfile({ role: "admin" });
    const { id } = await createReport(db, student, booking.id, { reason: "Retard de vingt minutes" });
    await expect(resolveReport(db, student, id, "dismiss")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const results = await Promise.allSettled([resolveReport(db, admin, id, "dismiss"), resolveReport(db, other, id, "suspend")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(resolveReport(db, admin, "abc", "dismiss")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [r] = await db.insert(reports).values({ reporterId: student.userId, reportedUserId: other.userId, reason: "Signalement d'un admin" }).returning();
    await expect(resolveReport(db, admin, r.id, "suspend")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

Run: `npm run test:integration -- tests/integration/reports.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/server/reports/service.ts` :

```ts
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bookings, meals, profiles, reports } from "@/db/schema";
import type { Actor } from "@/domain/bookings";
import { DomainError } from "@/domain/errors";
import { isUuid } from "@/domain/ids";
import { assertCanReport, otherParticipantId, participantRole } from "@/domain/interactions";
import type { Role } from "@/domain/types";
import { assertIsAdmin } from "@/domain/verification";
import { loadBookingContext } from "@/server/bookings/context";
import type { Tx } from "@/server/meals/service";

export const SUSPENSION_REASON = "Compte suspendu par l'équipe Ocleans";

const reportSchema = z.object({
  reason: z
    .string({ error: "Décrivez le problème" })
    .trim()
    .min(10, "Décrivez le problème (10 caractères minimum)")
    .max(1000, "1000 caractères maximum"),
});

export interface ReportTarget {
  bookingId: string;
  mealTitle: string;
  otherFirstName: string;
}

export interface OpenReport {
  id: string;
  reason: string;
  createdAt: Date;
  reporterFirstName: string;
  reportedUserId: string;
  reportedFirstName: string;
  reportedRole: Role;
  reportedSuspended: boolean;
  mealTitle: string | null;
}

const reporter = alias(profiles, "reporter");
const reported = alias(profiles, "reported");

export async function getReportTarget(db: Db, actor: Actor, bookingId: string): Promise<ReportTarget | null> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx || participantRole(actor, ctx) === null) return null;
  return {
    bookingId: ctx.bookingId,
    mealTitle: ctx.mealTitle,
    otherFirstName: participantRole(actor, ctx) === "host" ? ctx.studentFirstName : ctx.hostFirstName,
  };
}

export async function createReport(db: Db, actor: Actor, bookingId: string, raw: { reason?: unknown }): Promise<{ id: string }> {
  const { reason } = reportSchema.parse(raw);
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) throw new DomainError("NOT_FOUND");
  assertCanReport({ actor, ctx });
  const [row] = await db
    .insert(reports)
    .values({ reporterId: actor.userId, reportedUserId: otherParticipantId(actor, ctx), bookingId, reason })
    .returning({ id: reports.id });
  return row;
}

export async function listOpenReports(db: Db, actor: Actor): Promise<OpenReport[]> {
  assertIsAdmin(actor);
  return db
    .select({
      id: reports.id,
      reason: reports.reason,
      createdAt: reports.createdAt,
      reporterFirstName: reporter.firstName,
      reportedUserId: reports.reportedUserId,
      reportedFirstName: reported.firstName,
      reportedRole: reported.role,
      reportedSuspended: reported.suspended,
      mealTitle: meals.title,
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.userId, reports.reporterId))
    .innerJoin(reported, eq(reported.userId, reports.reportedUserId))
    .leftJoin(bookings, eq(bookings.id, reports.bookingId))
    .leftJoin(meals, eq(meals.id, bookings.mealId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt));
}

// Règle 9 : un compte suspendu ne se connecte plus, ses repas à venir sont annulés, et ses demandes à venir aussi.
async function suspendUser(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.update(profiles).set({ suspended: true }).where(eq(profiles.userId, userId));
  const futureMeals = await tx
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.hostId, userId), eq(meals.status, "open"), gt(meals.startsAt, now)));
  const mealIds = futureMeals.map((m) => m.id);
  if (mealIds.length > 0) {
    await tx.update(meals).set({ status: "cancelled", cancelReason: SUSPENSION_REASON }).where(inArray(meals.id, mealIds));
    await tx
      .update(bookings)
      .set({ status: "cancelled", cancelReason: SUSPENSION_REASON })
      .where(and(inArray(bookings.mealId, mealIds), inArray(bookings.status, ["pending", "accepted"])));
  }
  const upcomingForStudent = tx
    .select({ id: meals.id })
    .from(meals)
    .where(gt(meals.startsAt, now));
  await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledBy: userId, cancelReason: SUSPENSION_REASON })
    .where(
      and(eq(bookings.studentId, userId), inArray(bookings.status, ["pending", "accepted"]), inArray(bookings.mealId, upcomingForStudent)),
    );
}

export async function resolveReport(db: Db, actor: Actor, reportId: string, decision: "dismiss" | "suspend", now = new Date()): Promise<void> {
  assertIsAdmin(actor);
  if (!isUuid(reportId)) throw new DomainError("NOT_FOUND");
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for("update");
    if (!report) throw new DomainError("NOT_FOUND");
    if (report.status !== "open") throw new DomainError("INVALID_TRANSITION");
    if (decision === "suspend") {
      const [target] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.userId, report.reportedUserId));
      if (!target || target.role === "admin") throw new DomainError("FORBIDDEN");
      await suspendUser(tx, report.reportedUserId, now);
    }
    await tx.update(reports).set({ status: "handled", handledBy: actor.userId, handledAt: now }).where(eq(reports.id, reportId));
  });
}
```

- [ ] **Step 3: Lancer**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/reports tests/integration/reports.test.ts
git commit -m "feat: signalements et suspension de compte par l'admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Actions possibles et notes dans les listes

**Files:**
- Modify: `src/server/bookings/service.ts` (`StudentBooking`, `listStudentBookings`), `src/server/meals/service.ts` (`PublicMeal`, `HostMeal`, `HostMealRequest`, `listUpcomingMeals`, `getMealForViewer`, `loadHostMeals`, `listHostMeals`, `getHostMeal`)
- Test: `tests/integration/listings.test.ts`

**Interfaces:**
- Consumes: Task 1 (`canCancelBooking`, `canCancelMeal`, `canReadThread`, `canReview`, `BookingContext`) ; Task 5 (`getRatings`, `reviewedBookingIds`) ; `Rating`.
- Produces (les champs existants sont conservés) :
  - `StudentBooking` gagne `cancelReason: string | null` et `actions: { cancel: boolean; messages: boolean; review: boolean; report: boolean }` ; signature `listStudentBookings(db, actor, now?)`
  - `PublicMeal` gagne `hostRating: Rating | null` (donc aussi `MealDetail`)
  - `HostMeal` gagne `canCancel: boolean`
  - `HostMealRequest` gagne `cancelReason: string | null`, `studentRating: Rating | null`, `actions: { messages: boolean; review: boolean; report: boolean }`
  - signatures `listHostMeals(db, actor, now?)` et `getHostMeal(db, actor, mealId, now?)`

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/listings.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelMeal, getMealForViewer, listHostMeals, listUpcomingMeals } from "@/server/meals/service";
import { listStudentBookings } from "@/server/bookings/service";
import { submitReview } from "@/server/reviews/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const DAY = 24 * 3600 * 1000;

beforeEach(resetDb);
afterAll(closeDb);

describe("listStudentBookings", () => {
  it("indique pour chaque réservation les actions possibles et le motif d'annulation", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const upcoming = await makeBooking((await makeMeal(host.userId, { title: "À venir" })).id, student.userId, "accepted");
    await makeBooking((await makeMeal(host.userId, { title: "En attente" })).id, student.userId, "pending");
    const past = await makeBooking((await makeMeal(host.userId, { title: "Passé", startsAt: new Date(Date.now() - DAY) })).id, student.userId, "accepted");
    const cancelledMeal = await makeMeal(host.userId, { title: "Annulé" });
    await makeBooking(cancelledMeal.id, student.userId, "accepted");
    await cancelMeal(db, host, cancelledMeal.id, { reason: "Four en panne" });

    const byTitle = async () => Object.fromEntries((await listStudentBookings(db, student)).map((b) => [b.meal.title, b]));
    let list = await byTitle();
    expect(list["À venir"].actions).toEqual({ cancel: true, messages: true, review: false, report: true });
    expect(list["En attente"].actions).toEqual({ cancel: true, messages: false, review: false, report: true });
    expect(list["Passé"].actions).toEqual({ cancel: false, messages: true, review: true, report: true });
    expect(list["Annulé"]).toMatchObject({ status: "cancelled", cancelReason: "Four en panne" });
    expect(list["Annulé"].actions).toMatchObject({ cancel: false, messages: true, review: false });

    await submitReview(db, student, past.id, { rating: "5" });
    list = await byTitle();
    expect(list["Passé"].actions.review).toBe(false);
    expect(list["À venir"].id).toBe(upcoming.id);
  });
});

describe("listHostMeals", () => {
  it("donne à l'hôte la note des étudiants, les motifs et les actions", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile({ firstName: "Léa" });
    const otherHost = await makeProfile({ role: "host" });
    const pastWithOther = await makeBooking((await makeMeal(otherHost.userId, { startsAt: new Date(Date.now() - 2 * DAY) })).id, student.userId, "accepted");
    await submitReview(db, otherHost, pastWithOther.id, { rating: "4" });

    const upcoming = await makeMeal(host.userId, { title: "Prochain" });
    await makeBooking(upcoming.id, student.userId, "accepted");
    const pastMeal = await makeMeal(host.userId, { title: "Ancien", startsAt: new Date(Date.now() - DAY) });
    await makeBooking(pastMeal.id, student.userId, "accepted");

    const meals = Object.fromEntries((await listHostMeals(db, host)).map((m) => [m.title, m]));
    expect(meals["Prochain"].canCancel).toBe(true);
    expect(meals["Ancien"].canCancel).toBe(false);
    expect(meals["Prochain"].requests[0]).toMatchObject({
      studentRating: { average: 4, count: 1 },
      cancelReason: null,
      actions: { messages: true, review: false, report: true },
    });
    expect(meals["Ancien"].requests[0].actions.review).toBe(true);
  });
});

describe("notes publiques", () => {
  it("affiche la note moyenne de l'hôte dans la liste et la fiche", async () => {
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const past = await makeBooking((await makeMeal(host.userId, { startsAt: new Date(Date.now() - DAY) })).id, student.userId, "accepted");
    await submitReview(db, student, past.id, { rating: "5" });
    const meal = await makeMeal(host.userId);
    const [listed] = await listUpcomingMeals(db, {});
    expect(listed.hostRating).toEqual({ average: 5, count: 1 });
    expect((await getMealForViewer(db, null, meal.id))?.hostRating).toEqual({ average: 5, count: 1 });
    const newHost = await makeProfile({ role: "host" });
    const fresh = await makeMeal(newHost.userId);
    expect((await getMealForViewer(db, null, fresh.id))?.hostRating).toBeNull();
  });
});
```

Run: `npm run test:integration -- tests/integration/listings.test.ts`
Expected: FAIL (champs absents).

- [ ] **Step 2: `listStudentBookings`**

Dans `src/server/bookings/service.ts` :
1. Ajouter aux imports `canCancelBooking`, `canReadThread`, `canReview` et `type BookingContext` depuis `@/domain/interactions`, puis `reviewedBookingIds` depuis `@/server/reviews/service`.
2. Dans `StudentBooking`, ajouter :

```ts
  cancelReason: string | null;
  actions: { cancel: boolean; messages: boolean; review: boolean; report: boolean };
```

3. Remplacer `listStudentBookings` par :

```ts
export async function listStudentBookings(db: Db, actor: Actor, now = new Date()): Promise<StudentBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      cancelReason: bookings.cancelReason,
      createdAt: bookings.createdAt,
      mealId: meals.id,
      title: meals.title,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      mealStatus: meals.status,
      seatsTotal: meals.seatsTotal,
      address: meals.address,
      hostId: meals.hostId,
      hostFirstName: profiles.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(profiles, eq(profiles.userId, meals.hostId))
    .where(eq(bookings.studentId, actor.userId))
    .orderBy(desc(meals.startsAt));
  const reviewed = await reviewedBookingIds(db, actor.userId, rows.map((r) => r.id));

  return rows.map((r) => {
    const ctx: BookingContext = {
      hostId: r.hostId,
      studentId: actor.userId,
      bookingStatus: r.status,
      meal: { hostId: r.hostId, status: r.mealStatus, startsAt: r.startsAt, seatsTotal: r.seatsTotal },
    };
    return {
      id: r.id,
      status: r.status,
      requestMessage: r.requestMessage,
      cancelReason: r.cancelReason,
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
      actions: {
        cancel: canCancelBooking({ actor, ctx, now }),
        messages: canReadThread(actor, ctx),
        review: canReview({ actor, ctx, alreadyReviewed: reviewed.has(r.id), now }),
        report: true,
      },
    };
  });
}
```

- [ ] **Step 3: Repas publics et repas de l'hôte**

Dans `src/server/meals/service.ts` :
1. Ajouter aux imports `canCancelMeal`, `canReadThread`, `canReview` et `type BookingContext` depuis `@/domain/interactions`, `type Rating` depuis `@/domain/types`, et `getRatings`, `reviewedBookingIds` depuis `@/server/reviews/service`.
2. Ajouter `hostRating: Rating | null;` à `PublicMeal`, `canCancel: boolean;` à `HostMeal`, et à `HostMealRequest` :

```ts
  cancelReason: string | null;
  studentRating: Rating | null;
  actions: { messages: boolean; review: boolean; report: boolean };
```

3. Dans `listUpcomingMeals`, remplacer le `return` final par :

```ts
  const counts = await acceptedCounts(db, rows.map((r) => r.id));
  const ratings = await getRatings(db, rows.map((r) => r.hostId));
  return rows.map((r) => ({
    ...r,
    seatsLeft: seatsLeft(r.seatsTotal, counts.get(r.id) ?? 0),
    hostRating: ratings.get(r.hostId) ?? null,
  }));
```

(la ligne `const counts = …` existante est remplacée par celle-ci).

4. Dans `getMealForViewer`, le `return` final devient :

```ts
  const ratings = await getRatings(db, [row.hostId]);
  return {
    ...row,
    seatsLeft: seatsLeft(row.seatsTotal, await countAccepted(db, mealId)),
    hostRating: ratings.get(row.hostId) ?? null,
    address,
    viewerBooking,
  };
```

5. Remplacer `loadHostMeals`, `listHostMeals` et `getHostMeal` par :

```ts
async function loadHostMeals(db: Db, actor: Actor, now: Date, mealId?: string): Promise<HostMeal[]> {
  const conditions: SQL[] = [eq(meals.hostId, actor.userId)];
  if (mealId) conditions.push(eq(meals.id, mealId));
  const rows = await db
    .select({
      id: meals.id,
      hostId: meals.hostId,
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
      studentId: bookings.studentId,
      status: bookings.status,
      requestMessage: bookings.requestMessage,
      cancelReason: bookings.cancelReason,
      createdAt: bookings.createdAt,
      studentFirstName: profiles.firstName,
      studentSchool: profiles.school,
      studentVerification: profiles.verificationStatus,
    })
    .from(bookings)
    .innerJoin(profiles, eq(profiles.userId, bookings.studentId))
    .where(inArray(bookings.mealId, rows.map((r) => r.id)))
    .orderBy(asc(bookings.createdAt));
  const ratings = await getRatings(db, requests.map((r) => r.studentId));
  const reviewed = await reviewedBookingIds(db, actor.userId, requests.map((r) => r.id));

  return rows.map(({ hostId, ...meal }) => {
    const mealState = { hostId, status: meal.status, startsAt: meal.startsAt, seatsTotal: meal.seatsTotal };
    const own = requests.filter((r) => r.mealId === meal.id);
    const accepted = own.filter((r) => r.status === "accepted").length;
    return {
      ...meal,
      seatsLeft: seatsLeft(meal.seatsTotal, accepted),
      canCancel: canCancelMeal({ actor, meal: mealState, now }),
      requests: own.map((r) => {
        const ctx: BookingContext = { hostId, studentId: r.studentId, bookingStatus: r.status, meal: mealState };
        return {
          id: r.id,
          status: r.status,
          requestMessage: r.requestMessage,
          cancelReason: r.cancelReason,
          createdAt: r.createdAt,
          studentFirstName: r.studentFirstName,
          studentSchool: r.studentSchool,
          studentVerified: r.studentVerification === "verified",
          studentRating: ratings.get(r.studentId) ?? null,
          actions: {
            messages: canReadThread(actor, ctx),
            review: canReview({ actor, ctx, alreadyReviewed: reviewed.has(r.id), now }),
            report: true,
          },
        };
      }),
    };
  });
}

export function listHostMeals(db: Db, actor: Actor, now = new Date()): Promise<HostMeal[]> {
  return loadHostMeals(db, actor, now);
}

export async function getHostMeal(db: Db, actor: Actor, mealId: string, now = new Date()): Promise<HostMeal | null> {
  if (!isUuid(mealId)) return null;
  const [meal] = await loadHostMeals(db, actor, now, mealId);
  return meal ?? null;
}
```

- [ ] **Step 4: Lancer**

Run: `npx tsc --noEmit && npm run test:integration`
Expected: PASS (toutes les suites, anciennes comprises).

- [ ] **Step 5: Commit**

```bash
git add src/server tests/integration/listings.test.ts
git commit -m "feat: actions possibles, motifs d'annulation et notes dans les listes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Écrans d'annulation et affichage des notes

**Files:**
- Create: `src/components/cancel-form.tsx`, `src/components/rating-badge.tsx`
- Modify: `src/server/meals/actions.ts`, `src/server/bookings/actions.ts`, `src/app/hote/offres/page.tsx`, `src/app/etudiant/mes-repas/page.tsx`, `src/components/meal-card.tsx`, `src/app/repas/[id]/page.tsx`

**Interfaces:**
- Consumes: `cancelMeal` (Task 3), `cancelBooking` (Task 3), Task 7 (champs des listes) ; `FormState`, `formValues`, `toFormState` (Plan 1).
- Produces: `cancelMealAction(mealId, prev, fd)`, `cancelBookingAction(bookingId, prev, fd)`, `<CancelForm action buttonLabel confirmLabel />`, `<RatingBadge rating />`.

- [ ] **Step 1: Actions**

Ajouter à `src/server/meals/actions.ts` (et `cancelMeal` dans l'import du service) :

```ts
export async function cancelMealAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd);
  try {
    await cancelMeal(getDb(), actor, mealId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  revalidatePath("/etudiant/mes-repas");
  return { ok: true };
}
```

Ajouter à `src/server/bookings/actions.ts` (et `cancelBooking` dans l'import du service) :

```ts
export async function cancelBookingAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = formValues(fd);
  try {
    await cancelBooking(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  return { ok: true };
}
```

- [ ] **Step 2: Composants**

`src/components/cancel-form.tsx` :

```tsx
"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/server/form-state";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function CancelForm({
  action,
  buttonLabel,
  confirmLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  buttonLabel: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();
  if (state.ok) return <p className="text-sm text-stone-600">Annulation enregistrée.</p>;
  return (
    <details className="rounded-lg border border-stone-200 bg-white p-3" open={Boolean(state.error)}>
      <summary className="cursor-pointer text-sm font-medium text-red-700">{buttonLabel}</summary>
      <form action={formAction} className="mt-3 space-y-2">
        <FormError message={state.error} />
        <Label htmlFor={id}>Raison (communiquée à l'autre personne)</Label>
        <Input id={id} name="reason" required minLength={3} maxLength={300} defaultValue={(state.values?.reason as string) ?? ""} />
        <FieldError errors={state.fieldErrors?.reason} />
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Annulation…" : confirmLabel}
        </Button>
      </form>
    </details>
  );
}
```

`src/components/rating-badge.tsx` :

```tsx
import type { Rating } from "@/domain/types";

export function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return (
    <span className="whitespace-nowrap text-sm text-amber-700" aria-label={`Note moyenne ${rating.average} sur 5, ${rating.count} avis`}>
      ★ {rating.average.toFixed(1).replace(".", ",")} ({rating.count})
    </span>
  );
}
```

- [ ] **Step 3: Écrans de l'hôte**

Dans `src/app/hote/offres/page.tsx` :
1. Importer `Link`, `CancelForm`, `RatingBadge` et `cancelMealAction`.
2. Remplacer le bloc `{upcoming && (<LinkButton … Modifier …)}` par :

```tsx
            {upcoming && (
              <div className="flex flex-wrap items-start gap-2">
                <LinkButton href={`/hote/offres/${meal.id}/modifier`} variant="secondary">Modifier</LinkButton>
              </div>
            )}
            {meal.canCancel && (
              <CancelForm action={cancelMealAction.bind(null, meal.id)} buttonLabel="Annuler ce repas" confirmLabel="Confirmer l'annulation du repas" />
            )}
            {meal.status === "cancelled" && <p className="text-sm text-stone-600">Repas annulé.</p>}
```

3. Dans la carte de chaque demande, après le badge de statut, ajouter `<RatingBadge rating={r.studentRating} />`. Sous le message de la demande, ajouter :

```tsx
                  {r.status === "cancelled" && r.cancelReason && (
                    <p className="text-sm text-stone-600">Annulée : {r.cancelReason}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {r.actions.messages && <Link href={`/messages/${r.id}`} className="font-medium text-orange-700 underline">Messages</Link>}
                    {r.actions.review && <Link href={`/avis/${r.id}`} className="font-medium text-orange-700 underline">Laisser un avis</Link>}
                    {r.actions.report && <Link href={`/signaler/${r.id}`} className="text-stone-500 underline">Signaler</Link>}
                  </div>
```

- [ ] **Step 4: Écran « Mes repas » de l'étudiant**

Dans `src/app/etudiant/mes-repas/page.tsx` :
1. Importer `CancelForm` et `cancelBookingAction`.
2. Dans chaque carte, après la ligne de l'adresse, ajouter :

```tsx
          {b.status === "cancelled" && b.cancelReason && (
            <p className="text-sm text-stone-600">Annulée : {b.cancelReason}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm">
            {b.actions.messages && <Link href={`/messages/${b.id}`} className="font-medium text-orange-700 underline">Messages</Link>}
            {b.actions.review && <Link href={`/avis/${b.id}`} className="font-medium text-orange-700 underline">Laisser un avis</Link>}
            {b.actions.report && <Link href={`/signaler/${b.id}`} className="text-stone-500 underline">Signaler</Link>}
          </div>
          {b.actions.cancel && (
            <CancelForm action={cancelBookingAction.bind(null, b.id)} buttonLabel="Annuler ma venue" confirmLabel="Confirmer l'annulation" />
          )}
```

- [ ] **Step 5: Notes sur les repas publics**

Dans `src/components/meal-card.tsx`, la ligne « chez … » devient :

```tsx
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-stone-600">
          <span>{formatMealDate(meal.startsAt)} · {meal.neighborhood} · chez {meal.hostFirstName}</span>
          <RatingBadge rating={meal.hostRating} />
        </p>
```

(avec l'import de `RatingBadge`). Faire de même dans `src/app/repas/[id]/page.tsx`, sur la ligne date · quartier · hôte, et y afficher aussi, quand `meal.status === "cancelled"`, un paragraphe « Ce repas a été annulé par l'hôte. ».

- [ ] **Step 6: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe.

Vérification manuelle (`npm run dev`, Playwright MCP, après `npm run seed:demo`) :
1. Connexion rapide Léa → « Mes repas » : sur « Blanquette de veau », acceptée, les liens « Messages » et « Signaler » et le bouton « Annuler ma venue » sont visibles. Annuler sans motif affiche le message d'erreur ; avec « Partiel déplacé », le statut devient « Annulée » et le motif s'affiche.
2. Connexion rapide Mireille → « Mes offres » : la demande de Léa est « Annulée » avec son motif. « Annuler ce repas » sur « Soupe au pistou », avec le motif « Imprévu », affiche « Repas annulé ». Le repas disparaît de `/repas`.
3. `/repas` : les notes ★ apparaissent une fois le seed de la Task 12 appliqué. Avant cela, aucune note n'est affichée, sans erreur.
4. `npm run seed:demo`.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: annulation depuis les écrans et notes affichées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Écran de conversation

**Files:**
- Create: `src/server/messages/actions.ts`, `src/components/thread-view.tsx`, `src/app/messages/[id]/page.tsx`
- Modify: `src/domain/routes.ts`, `src/domain/routes.test.ts`

**Interfaces:**
- Consumes: `getThread`, `postMessage` (Task 4) ; `formatMessageTime` (Task 1).
- Produces: `postMessageAction(bookingId, prev, fd)` ; route protégée `/messages/[id]` ; préfixes protégés `/messages`, `/avis`, `/signaler`.

- [ ] **Step 1: Routes protégées (test qui échoue)**

Dans `src/domain/routes.test.ts`, ajouter au premier `it` :

```ts
    expect(isProtectedPath("/messages/123")).toBe(true);
    expect(isProtectedPath("/avis/123")).toBe(true);
    expect(isProtectedPath("/signaler/123")).toBe(true);
```

Run: `npm test -- src/domain/routes.test.ts`
Expected: FAIL.

Dans `src/domain/routes.ts` : `const PROTECTED_PREFIXES = ["/etudiant", "/hote", "/admin", "/messages", "/avis", "/signaler", "/bienvenue"];`

Run: `npm test -- src/domain/routes.test.ts`
Expected: PASS.

- [ ] **Step 2: Action**

`src/server/messages/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { postMessage } from "./service";

export async function postMessageAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await postMessage(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath(`/messages/${bookingId}`);
  return { ok: true };
}
```

- [ ] **Step 3: Vue de la conversation**

`src/components/thread-view.tsx` :

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { formatMessageTime } from "@/domain/dates";
import { postMessageAction } from "@/server/messages/actions";
import { Button, Textarea, cx } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export interface ThreadViewMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  senderFirstName: string;
}

const REFRESH_MS = 5000;

export function ThreadView({ bookingId, canWrite, messages }: { bookingId: string; canWrite: boolean; messages: ThreadViewMessage[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(postMessageAction.bind(null, bookingId), {});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Spec §3.2 D : rafraîchissement toutes les 5 secondes, seulement quand l'onglet est visible.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
        {messages.length === 0 && <p className="text-sm text-stone-500">Pas encore de message. Présentez-vous !</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cx(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
              m.mine ? "ml-auto bg-orange-600 text-white" : "border border-stone-200 bg-white text-stone-900",
            )}
          >
            <p className="whitespace-pre-line break-words">{m.body}</p>
            <p className="mt-1 text-[11px] opacity-75">
              {m.mine ? "Vous" : m.senderFirstName} · {formatMessageTime(new Date(m.createdAt))}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canWrite ? (
        <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-2">
          <FormError message={state.error} />
          <Textarea name="body" required maxLength={1000} placeholder="Votre message…" defaultValue={(state.values?.body as string) ?? ""} />
          <FieldError errors={state.fieldErrors?.body} />
          <Button type="submit" disabled={pending}>{pending ? "Envoi…" : "Envoyer"}</Button>
        </form>
      ) : (
        <p className="text-sm text-stone-600">Cette conversation est fermée (repas annulé ou terminé depuis plus de 7 jours).</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Page**

`src/app/messages/[id]/page.tsx` :

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/thread-view";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { getThread } from "@/server/messages/service";
import { requireProfile } from "@/server/session";

export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const thread = await getThread(getDb(), actor, id);
  if (!thread) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Conversation avec {thread.otherFirstName}</h1>
        <p className="text-sm text-stone-600">
          {thread.mealTitle} · {formatMealDate(thread.mealStartsAt)}
        </p>
      </div>
      <ThreadView
        bookingId={thread.bookingId}
        canWrite={thread.canWrite}
        messages={thread.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
      <Link href={`/signaler/${thread.bookingId}`} className="inline-block text-sm text-stone-500 underline">
        Signaler un problème
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe.

Vérification manuelle (Playwright MCP, deux onglets avec `browser_tabs`) :
1. Onglet 1, Léa : « Mes repas », puis « Messages » sur « Blanquette de veau ». Envoyer « Bonjour Mireille ! ». Le message apparaît à droite, en orange.
2. Onglet 2, Mireille : `/messages/<même id>`. Le message de Léa est visible ; répondre « Avec plaisir ».
3. Revenir à l'onglet 1 et attendre 6 secondes : la réponse apparaît sans recharger.
4. Ouvrir `/messages/<id>` avec un compte tiers (Karim) : page 404.
5. `npm run seed:demo`.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: écran de conversation rafraîchi toutes les 5 secondes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Écrans d'avis et de signalement

**Files:**
- Create: `src/server/reviews/actions.ts`, `src/server/reports/actions.ts`, `src/components/review-form.tsx`, `src/components/report-form.tsx`, `src/app/avis/[id]/page.tsx`, `src/app/signaler/[id]/page.tsx`

**Interfaces:**
- Consumes: `submitReview`, `getReviewPrompt` (Task 5) ; `createReport`, `getReportTarget` (Task 6).
- Produces: `submitReviewAction(bookingId, prev, fd)`, `createReportAction(bookingId, prev, fd)` ; routes `/avis/[id]` et `/signaler/[id]`.

- [ ] **Step 1: Actions**

`src/server/reviews/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { submitReview } from "./service";

export async function submitReviewAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await submitReview(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  return { ok: true };
}
```

`src/server/reports/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { createReport, resolveReport } from "./service";

export async function createReportAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await createReport(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/admin/signalements");
  return { ok: true };
}

export async function resolveReportAction(
  reportId: string,
  decision: "dismiss" | "suspend",
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("admin");
  if (decision !== "dismiss" && decision !== "suspend") return { error: "Décision inconnue." };
  try {
    await resolveReport(getDb(), actor, reportId, decision);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/admin/signalements");
  revalidatePath("/repas");
  return { ok: true };
}
```

- [ ] **Step 2: Formulaires**

`src/components/review-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { submitReviewAction } from "@/server/reviews/actions";
import { Button, Label, LinkButton, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReviewForm({ bookingId, otherFirstName }: { bookingId: string; otherFirstName: string }) {
  const [state, action, pending] = useActionState(submitReviewAction.bind(null, bookingId), {});
  const v = state.values ?? {};
  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-green-50 p-3 text-green-800">Merci pour votre avis !</p>
        <LinkButton href="/" variant="secondary">Retour à l'accueil</LinkButton>
      </div>
    );
  }
  return (
    <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-4">
      <FormError message={state.error} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Votre note pour {otherFirstName}</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex cursor-pointer flex-col items-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm has-[:checked]:border-orange-600 has-[:checked]:bg-orange-50">
              <input type="radio" name="rating" value={n} defaultChecked={v.rating === String(n)} className="sr-only" required />
              <span className="text-lg text-amber-600" aria-hidden>{"★".repeat(n)}</span>
              <span>{n}</span>
            </label>
          ))}
        </div>
        <FieldError errors={state.fieldErrors?.rating} />
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="comment">Un mot sur ce moment (facultatif)</Label>
        <Textarea id="comment" name="comment" maxLength={500} defaultValue={(v.comment as string) ?? ""} />
        <FieldError errors={state.fieldErrors?.comment} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Envoi…" : "Publier mon avis"}</Button>
    </form>
  );
}
```

`src/components/report-form.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { createReportAction } from "@/server/reports/actions";
import { Button, Label, LinkButton, Textarea } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReportForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(createReportAction.bind(null, bookingId), {});
  if (state.ok) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-green-50 p-3 text-green-800">Signalement envoyé. L'équipe Ocleans va l'examiner.</p>
        <LinkButton href="/" variant="secondary">Retour à l'accueil</LinkButton>
      </div>
    );
  }
  return (
    <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-3">
      <FormError message={state.error} />
      <Label htmlFor="reason">Que s'est-il passé ?</Label>
      <Textarea id="reason" name="reason" required minLength={10} maxLength={1000} defaultValue={(state.values?.reason as string) ?? ""} />
      <FieldError errors={state.fieldErrors?.reason} />
      <p className="text-xs text-stone-500">Votre signalement est confidentiel : seule l'équipe Ocleans le lit.</p>
      <Button type="submit" variant="danger" disabled={pending} className="w-full">{pending ? "Envoi…" : "Envoyer le signalement"}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Pages**

`src/app/avis/[id]/page.tsx` :

```tsx
import { notFound } from "next/navigation";
import { ReviewForm } from "@/components/review-form";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { getReviewPrompt } from "@/server/reviews/service";
import { requireProfile } from "@/server/session";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const prompt = await getReviewPrompt(getDb(), actor, id);
  if (!prompt) notFound();
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Votre avis sur « {prompt.mealTitle} »</h1>
      <Card>
        {prompt.allowed ? <ReviewForm bookingId={prompt.bookingId} otherFirstName={prompt.otherFirstName} /> : <p className="text-stone-600">{prompt.reason}</p>}
      </Card>
    </main>
  );
}
```

`src/app/signaler/[id]/page.tsx` :

```tsx
import { notFound } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { getReportTarget } from "@/server/reports/service";
import { requireProfile } from "@/server/session";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const target = await getReportTarget(getDb(), actor, id);
  if (!target) notFound();
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Signaler un problème avec {target.otherFirstName}</h1>
      <p className="text-sm text-stone-600">Repas : {target.mealTitle}</p>
      <Card>
        <ReportForm bookingId={target.bookingId} />
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe.

Vérification manuelle (Playwright MCP, après le seed de la Task 12 ou avec un repas passé créé par `run_sql`) :
1. Léa, sur un repas passé accepté, clique « Laisser un avis ». Publier sans note affiche le message ; avec 5 ★ et un commentaire, on obtient « Merci pour votre avis ! ». Le lien disparaît de « Mes repas ».
2. `/avis/<id d'un repas à venir>` affiche « Vous pourrez laisser un avis une fois le repas passé. »
3. « Signaler » avec un motif de 5 caractères affiche le message d'erreur ; avec un motif valide, on obtient « Signalement envoyé ».
4. `npm run seed:demo`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: écrans d'avis et de signalement

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Écran admin des signalements

**Files:**
- Create: `src/components/report-actions.tsx`, `src/app/admin/signalements/page.tsx`
- Modify: `src/components/site-header.tsx`

**Interfaces:**
- Consumes: `listOpenReports` (Task 6), `resolveReportAction` (Task 10).
- Produces: route `/admin/signalements`, et le lien « Signalements » dans l'en-tête admin.

- [ ] **Step 1: Boutons de décision**

`src/components/report-actions.tsx` :

```tsx
"use client";

import { useActionState } from "react";
import { resolveReportAction } from "@/server/reports/actions";
import { Button } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function ReportActions({ reportId, reportedFirstName, canSuspend }: { reportId: string; reportedFirstName: string; canSuspend: boolean }) {
  const [dismissState, dismiss, dismissing] = useActionState(resolveReportAction.bind(null, reportId, "dismiss"), {});
  const [suspendState, suspend, suspending] = useActionState(resolveReportAction.bind(null, reportId, "suspend"), {});
  const pending = dismissing || suspending;
  return (
    <div className="space-y-2">
      <FormError message={dismissState.error ?? suspendState.error} />
      <div className="flex flex-wrap gap-2">
        <form action={dismiss}>
          <Button type="submit" variant="secondary" disabled={pending}>Classer sans suite</Button>
        </form>
        {canSuspend && (
          <form action={suspend}>
            <Button type="submit" variant="danger" disabled={pending}>Suspendre {reportedFirstName}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page**

`src/app/admin/signalements/page.tsx` :

```tsx
import { ReportActions } from "@/components/report-actions";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { listOpenReports } from "@/server/reports/service";
import { requireProfile } from "@/server/session";

const ROLE_LABELS = { student: "étudiant·e", host: "hôte", admin: "admin" } as const;

export default async function AdminReportsPage() {
  const actor = await requireProfile("admin");
  const list = await listOpenReports(getDb(), actor);
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Signalements ouverts ({list.length})</h1>
      {list.length === 0 && <p className="text-stone-600">Aucun signalement en attente.</p>}
      {list.map((r) => (
        <Card key={r.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{r.reporterFirstName} signale {r.reportedFirstName}</h2>
            <Badge>{ROLE_LABELS[r.reportedRole]}</Badge>
            {r.reportedSuspended && <Badge tone="red">Déjà suspendu</Badge>}
          </div>
          <p className="text-sm text-stone-600">
            {r.mealTitle ? `Repas : ${r.mealTitle} · ` : ""}signalé {formatMealDate(r.createdAt)}
          </p>
          <p className="whitespace-pre-line rounded-lg bg-stone-50 p-3">{r.reason}</p>
          <p className="text-xs text-stone-500">
            Suspendre annule les repas et les demandes à venir de ce compte, qui ne pourra plus se connecter.
          </p>
          <ReportActions reportId={r.id} reportedFirstName={r.reportedFirstName} canSuspend={!r.reportedSuspended && r.reportedRole !== "admin"} />
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: En-tête**

Dans `src/components/site-header.tsx`, remplacer le lien admin par :

```tsx
          {profile?.role === "admin" && (
            <>
              <Link href="/admin/verifications">Vérifications</Link>
              <Link href="/admin/signalements">Signalements</Link>
            </>
          )}
```

- [ ] **Step 4: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test && npm run test:integration`
Expected: tout passe.

Vérification manuelle : l'admin ouvre « Signalements » et voit celui de la Task 10. « Classer sans suite » le fait disparaître. Recréer un signalement de Léa contre Mireille puis « Suspendre Mireille » : ses repas à venir disparaissent de `/repas`, et la connexion rapide de Mireille mène à `/compte-suspendu`. Relancer `npm run seed:demo`, qui rétablit `suspended = false`.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: écran admin des signalements (classer, suspendre)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Données de démo, déploiement et recette

**Files:**
- Modify: `scripts/seed-demo.ts`, `README.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: une démo publique avec une conversation, des avis (notes visibles) et un signalement ouvert.

- [ ] **Step 1: Seed**

Dans `scripts/seed-demo.ts` :
1. Ajouter `messages, reports, reviews` à l'import du schéma.
2. Avant `await db.delete(meals)…`, effacer les signalements qui impliquent un compte de démo, y compris ceux qu'un visiteur de la démo publique aurait faits contre eux. Les messages et les avis partent en cascade avec les repas.

```ts
  const demoIds = [...ids.values()];
  await db.delete(reports).where(or(inArray(reports.reporterId, demoIds), inArray(reports.reportedUserId, demoIds)));
```

(ajouter `or` à l'import de `drizzle-orm`).

3. À la place de la boucle d'insertion des `BOOKINGS`, conserver les id :

```ts
  const bookingIds = new Map<string, string>();
  for (const b of BOOKINGS) {
    const [row] = await db
      .insert(bookings)
      .values({ mealId: mealIds.get(b.meal)!, studentId: ids.get(b.student)!, status: b.status, requestMessage: b.message })
      .returning({ id: bookings.id });
    bookingIds.set(`${b.meal}:${b.student}`, row.id);
  }
```

4. Ajouter ensuite :

```ts
  const blanquetteLea = bookingIds.get("blanquette:lea")!;
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  await db.insert(messages).values([
    { bookingId: blanquetteLea, senderId: ids.get("lea")!, body: "Bonjour Mireille, merci d'avoir accepté ! Je peux apporter le dessert ?", createdAt: minutesAgo(90) },
    { bookingId: blanquetteLea, senderId: ids.get("mireille")!, body: "Avec plaisir Léa ! Une tarte serait parfaite. Sonnez au 2e étage.", createdAt: minutesAgo(60) },
    { bookingId: blanquetteLea, senderId: ids.get("lea")!, body: "Parfait, à vendredi !", createdAt: minutesAgo(45) },
  ]);

  await db.insert(reviews).values([
    { bookingId: bookingIds.get("passe1:lea")!, authorId: ids.get("lea")!, targetId: ids.get("mireille")!, rating: 5, comment: "Un pot-au-feu délicieux et une soirée pleine d'histoires." },
    { bookingId: bookingIds.get("passe1:lea")!, authorId: ids.get("mireille")!, targetId: ids.get("lea")!, rating: 5, comment: "Léa est adorable, revenez quand vous voulez !" },
    { bookingId: bookingIds.get("passe2:karim")!, authorId: ids.get("karim")!, targetId: ids.get("jeanpierre")!, rating: 4, comment: "Confit excellent, Jean-Pierre est un vrai conteur." },
  ]);

  await db.insert(reports).values({
    reporterId: ids.get("jeanpierre")!,
    reportedUserId: ids.get("karim")!,
    bookingId: bookingIds.get("passe2:karim")!,
    reason: "Arrivé avec une heure de retard sans prévenir. (Signalement fictif pour la démonstration.)",
  });
```

5. Message final : `Démo prête : ${PEOPLE.length} comptes, ${MEALS.length} repas, ${BOOKINGS.length} demandes, 1 carte à vérifier, 3 messages, 3 avis, 1 signalement.`

Run: `npm run seed:demo && npm run seed:demo`
Expected: deux fois `Démo prête : 10 comptes, 15 repas, 8 demandes, 1 carte à vérifier, 3 messages, 3 avis, 1 signalement.` Avec `run_sql` sur `demo`, `select (select count(*) from messages), (select count(*) from reviews), (select count(*) from reports)` renvoie `3, 3, 1`.

- [ ] **Step 2: README**

Ajouter une section « Interactions » au `README.md` :

````markdown
## Interactions

- **Annulation** : l'hôte annule un repas (toutes les demandes suivent) ; l'étudiant annule sa venue. Un motif est obligatoire dans les deux cas.
- **Messagerie** : `/messages/<réservation>`, ouverte aux deux participants d'une réservation acceptée, rafraîchie toutes les 5 secondes, en lecture seule après une annulation ou 7 jours après le repas.
- **Avis** : `/avis/<réservation>` après le repas, une note de 1 à 5 par personne ; la moyenne s'affiche sur les repas.
- **Signalements** : `/signaler/<réservation>`. L'admin les traite sur `/admin/signalements` : il les classe, ou suspend le compte, ce qui annule ses repas et demandes à venir.
````

- [ ] **Step 3: Déployer**

```bash
vercel deploy --target preview --yes
vercel alias set <url-affichée> ocleans-demo.vercel.app
```

- [ ] **Step 4: Recette en ligne (Playwright MCP, 390×844)**

Sur https://ocleans-demo.vercel.app :
1. `/repas` : « chez Mireille ★ 5,0 (1) » et « chez Jean-Pierre ★ 4,0 (1) ».
2. Léa : « Mes repas », puis « Messages » sur « Blanquette de veau ». Les 3 messages du seed sont là ; en envoyer un.
3. Dans un autre onglet, Mireille : `/messages/<même id>`. Le nouveau message est visible ; répondre. Dans l'onglet de Léa, la réponse arrive en moins de 6 secondes.
4. Léa annule sa venue sur « Lasagnes maison », en attente, avec un motif. Le statut devient « Annulée » avec le motif ; côté « Famille Dupuy », la demande apparaît annulée.
5. Admin : « Signalements » affiche celui de Jean-Pierre contre Karim. Cliquer « Classer sans suite ».
6. Léa signale Mireille sur « Blanquette de veau » (« Test de recette, à ignorer »). L'admin clique « Suspendre Mireille » : ses repas disparaissent de `/repas`, et la connexion rapide de Mireille mène à `/compte-suspendu`.
7. `npm run seed:demo` remet la démo à zéro, Mireille comprise. Vérifier que ses repas sont revenus sur `/repas`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-demo.ts README.md
git commit -m "feat: conversation, avis et signalement de démonstration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
