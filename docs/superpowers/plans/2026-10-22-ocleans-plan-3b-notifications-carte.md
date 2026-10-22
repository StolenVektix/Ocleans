# Ocleans — Plan 3b : notifications et carte des repas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prévenir chaque personne des événements qui la concernent par une notification dans l'application : un compteur dans l'en-tête et une page `/notifications`. Chaque notification part aussi par email, en mode « log » tant qu'aucun domaine n'est configuré. En parallèle, les repas s'affichent sur une carte de Bordeaux, au niveau du quartier.

**Architecture:**
- **Création** : les notifications sont des lignes de la table `notifications`, créées **dans la même transaction** que l'événement métier (acceptation, annulation, etc.). Il n'y a donc jamais d'événement sans notification, ni l'inverse.
- **Envoi des emails** : il est découplé. Les notifications portent un `email_status` (`pending`, `sent`, `failed`, `skipped`). `deliverPendingEmails` les envoie via une interface `EmailSender` : le mode « log » par défaut, ou Resend dès que `RESEND_API_KEY` et `EMAIL_FROM` sont définis. Les Server Actions l'appellent par `after()` (après la réponse), et le cron quotidien en Production le rappelle.
- **Rappels de la veille** : ils sont créés **à la demande**. Quand l'utilisateur affiche une page, `ensureReminders` crée, sans doublon, le rappel de chacun de ses repas acceptés qui commence dans moins de 24 h. Le cron fait de même pour tout le monde, en Production.
- **Carte** : Leaflet, chargé uniquement côté client, avec les tuiles OpenStreetMap et un cercle par quartier.

**Tech Stack:** Next.js 16 (`after`), Neon Postgres + Drizzle, Leaflet 1.9, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-ocleans-repas-solidaires-design.md` (§3.2 B, décision du 2026-10-22 option C ; §3.2 C ; §5)

**Décisions propres à ce plan :**
- **Pas d'adresse exacte dans les notifications ni dans les emails.** La notification d'acceptation renvoie vers « Mes repas », où l'adresse s'affiche selon la règle 7 (masquée si la réservation est annulée). C'est plus prudent que la spec, qui prévoyait « demande acceptée avec l'adresse ».
- **Rappels à la demande en plus du cron** : sur Vercel, les crons ne tournent qu'en Production. Sans cela, la démo, déployée en Preview, n'aurait jamais de rappels.
- **Notifications envoyées** :
  - demande reçue → hôte ;
  - demande acceptée ou refusée → étudiant ;
  - annulation d'une venue → hôte ;
  - annulation d'un repas → étudiants concernés ;
  - annulation par l'équipe (suspension) → l'autre participant ;
  - rappel de la veille → hôte et étudiants acceptés ;
  - carte étudiante validée ou refusée → étudiant.
  - Pas de notification par message reçu : la conversation se rafraîchit déjà toute seule.
- Correction reportée du Plan 3a : dans la cascade de suspension, `cancelledBy` vaut **l'id de l'admin** dans les deux branches (hôte comme étudiant suspendu).
- En mode « log », l'email n'est pas écrit en entier dans les journaux : seuls le destinataire masqué (`l***@etu.u-bordeaux.fr`), le type et le titre y figurent.

## Global Constraints

- Toutes les contraintes globales des plans précédents restent valables : interface en français, Next.js 16, Drizzle sans `db.query.*`, aucun secret committé, commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Une notification est créée dans la transaction de l'événement : si l'événement échoue, aucune notification n'est créée.
- Un échec d'email ne fait jamais échouer l'action métier : la notification passe en `failed` et reste visible dans l'application.
- La clé `dedupe_key` est unique. Les rappels utilisent `reminder:<bookingId>:<userId>`, ce qui garantit un seul rappel par personne et par réservation.
- La route du cron exige `Authorization: Bearer ${CRON_SECRET}` et répond 401 sinon.
- Variables : `APP_URL` (liens absolus des emails), `CRON_SECRET`, et, optionnelles, `RESEND_API_KEY` et `EMAIL_FROM`. Sans elles, le mode « log » s'applique.
- La carte ne montre que le centre du quartier, jamais l'adresse (règle 7). Les tuiles OpenStreetMap portent leur attribution.

## Review Focus

1. **Un hôte annule un repas à 3 demandes**, dont une déjà refusée : seuls les 2 étudiants concernés reçoivent « Repas annulé », avec le motif, et l'hôte n'est pas notifié de sa propre action. Test en Task 3.
2. **Un utilisateur affiche plusieurs pages la veille du repas** : un seul rappel est créé, même si deux requêtes arrivent en même temps. Test en Task 2.
3. **L'envoi d'email plante** (fournisseur indisponible) : l'action métier réussit, et la notification reste visible avec `email_status = failed`. Test en Task 4.
4. **Appel de la route du cron sans le bon secret** : réponse 401, et aucun rappel créé. Test en Task 5.
5. **Repas d'un quartier hors liste ou sans coordonnées** : la carte ne plante pas et ignore ce repas. Chaque quartier de la liste a des coordonnées dans la métropole bordelaise. Test en Task 6.

---

## Structure des fichiers

```
src/domain/types.ts                    + NOTIFICATION_TYPES, EMAIL_STATUSES
src/db/schema.ts                       + table notifications
src/server/notifications/service.ts    queueNotifications, listNotifications, countUnread, markAllRead, ensureReminders
src/services/email.ts                  EmailSender, createLogEmailSender, createResendEmailSender, getEmailSender, maskEmail, renderEmail
src/server/notifications/delivery.ts   deliverPendingEmails, scheduleEmailDelivery
src/app/api/cron/daily/route.ts        cron quotidien (rappels + emails)
vercel.json                            déclaration du cron
src/app/notifications/page.tsx, src/components/mark-read-button.tsx
src/config/neighborhood-coordinates.ts coordonnées des quartiers
src/components/meals-map.tsx, src/components/meals-map-inner.tsx
```

---

### Task 1: Table des notifications

**Files:**
- Modify: `src/domain/types.ts`, `src/db/schema.ts`, `tests/integration/helpers.ts`
- Create: `drizzle/0003_*.sql` (généré)
- Test: `tests/integration/schema.test.ts` (ajout d'un cas)

**Interfaces:**
- Produces:
  - `NOTIFICATION_TYPES = ["booking_requested", "booking_accepted", "booking_declined", "booking_cancelled", "meal_cancelled", "cancelled_by_team", "reminder", "verification_approved", "verification_rejected"]`, `type NotificationType`
  - `EMAIL_STATUSES = ["pending", "sent", "failed", "skipped"]`, `type EmailStatus`
  - Table `notifications` : `id`, `userId`, `type`, `title`, `body`, `link`, `dedupeKey` (unique, nullable), `readAt`, `emailStatus` (défaut `pending`), `emailedAt`, `createdAt` ; type `Notification`

- [ ] **Step 1: Types et schéma**

Ajouter à `src/domain/types.ts` :

```ts
export const NOTIFICATION_TYPES = [
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_cancelled",
  "meal_cancelled",
  "cancelled_by_team",
  "reminder",
  "verification_approved",
  "verification_rejected",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const EMAIL_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
```

Dans `src/db/schema.ts`, ajouter `NOTIFICATION_TYPES` et `EMAIL_STATUSES` à l'import de `../domain/types`, puis, avant les exports de types :

```ts
export const notificationTypeEnum = pgEnum("notification_type", NOTIFICATION_TYPES);
export const emailStatusEnum = pgEnum("email_status", EMAIL_STATUSES);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull(),
    dedupeKey: text("dedupe_key").unique("notifications_dedupe_key_unique"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailStatus: emailStatusEnum("email_status").notNull().default("pending"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_email_idx").on(t.emailStatus)],
);
```

et :

```ts
export type Notification = typeof notifications.$inferSelect;
```

- [ ] **Step 2: Migrations**

```bash
npm run db:generate && npm run db:migrate && npm run db:migrate:test
```

Expected: `drizzle/0003_*.sql` créé, et les deux migrations appliquées.

- [ ] **Step 3: Harnais et test du schéma**

Dans `tests/integration/helpers.ts`, ajouter `notifications` en tête de la liste du `truncate` : `truncate table notifications, reports, reviews, …`.

Ajouter dans `tests/integration/schema.test.ts`, avec `notifications` dans l'import de `@/db/schema` :

```ts
  it("refuse deux notifications avec la même clé de déduplication", async () => {
    const user = await makeProfile();
    const base = { userId: user.userId, type: "reminder" as const, title: "Rappel", body: "Demain", link: "/" };
    const [first] = await db.insert(notifications).values({ ...base, dedupeKey: "reminder:x:y" }).returning();
    expect(first).toMatchObject({ emailStatus: "pending", readAt: null });
    const error = await db.insert(notifications).values({ ...base, dedupeKey: "reminder:x:y" }).then(() => null, (e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    await db.insert(notifications).values(base);
    await db.insert(notifications).values(base);
  });
```

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/db drizzle tests/integration
git commit -m "feat: table des notifications

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Service des notifications et rappels

**Files:**
- Create: `src/server/notifications/service.ts`
- Test: `tests/integration/notifications.test.ts`

**Interfaces:**
- Consumes: `notifications`, `bookings`, `meals`, `profiles` (schéma) ; `Db`, `Tx` ; `formatMealDate`.
- Produces:
  - `interface NotificationInput { userId: string; type: NotificationType; title: string; body: string; link: string; dedupeKey?: string }`
  - `queueNotifications(db: Db | Tx, items: NotificationInput[]): Promise<void>` (ignore silencieusement un doublon de `dedupeKey`)
  - `interface NotificationItem { id: string; type: NotificationType; title: string; body: string; link: string; createdAt: Date; read: boolean }`
  - `listNotifications(db, userId, limit?): Promise<NotificationItem[]>` (30 par défaut, plus récentes d'abord)
  - `countUnread(db, userId): Promise<number>`
  - `markAllRead(db, userId, now?): Promise<void>`
  - `REMINDER_WINDOW_HOURS = 24`
  - `ensureReminders(db, { userId?: string; now?: Date }): Promise<number>` (nombre de rappels créés)

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/notifications.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { countUnread, ensureReminders, listNotifications, markAllRead, queueNotifications } from "@/server/notifications/service";
import { closeDb, db, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

const HOUR = 3600 * 1000;

beforeEach(resetDb);
afterAll(closeDb);

describe("notifications", () => {
  it("liste les notifications d'un utilisateur, compte les non lues et les marque lues", async () => {
    const user = await makeProfile();
    const other = await makeProfile();
    await queueNotifications(db, [
      { userId: user.userId, type: "booking_accepted", title: "Demande acceptée", body: "Mireille vous attend.", link: "/etudiant/mes-repas" },
      { userId: user.userId, type: "booking_declined", title: "Demande refusée", body: "Désolé.", link: "/repas" },
      { userId: other.userId, type: "booking_requested", title: "Nouvelle demande", body: "…", link: "/hote/offres" },
    ]);
    expect(await countUnread(db, user.userId)).toBe(2);
    const list = await listNotifications(db, user.userId);
    expect(list.map((n) => n.title).sort()).toEqual(["Demande acceptée", "Demande refusée"]);
    expect(list.every((n) => !n.read)).toBe(true);
    await markAllRead(db, user.userId);
    expect(await countUnread(db, user.userId)).toBe(0);
    expect(await countUnread(db, other.userId)).toBe(1);
    await queueNotifications(db, []);
  });

  it("ignore un doublon de clé de déduplication sans erreur", async () => {
    const user = await makeProfile();
    const item = { userId: user.userId, type: "reminder" as const, title: "Rappel", body: "Demain", link: "/", dedupeKey: "k1" };
    await queueNotifications(db, [item]);
    await queueNotifications(db, [item]);
    expect(await db.select().from(notifications)).toHaveLength(1);
  });
});

describe("ensureReminders", () => {
  it("crée un rappel pour l'hôte et l'étudiant accepté d'un repas dans moins de 24 h, une seule fois", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const accepted = await makeProfile({ firstName: "Léa" });
    const pending = await makeProfile();
    const soon = await makeMeal(host.userId, { title: "Blanquette", startsAt: new Date(Date.now() + 20 * HOUR) });
    const later = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 40 * HOUR) });
    const cancelled = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 10 * HOUR), status: "cancelled" });
    await makeBooking(soon.id, accepted.userId, "accepted");
    await makeBooking(soon.id, pending.userId, "pending");
    await makeBooking(later.id, accepted.userId, "accepted");
    await makeBooking(cancelled.id, pending.userId, "accepted");

    expect(await ensureReminders(db, {})).toBe(2);
    expect(await ensureReminders(db, {})).toBe(0);
    const forStudent = await listNotifications(db, accepted.userId);
    expect(forStudent).toHaveLength(1);
    expect(forStudent[0]).toMatchObject({ type: "reminder", link: "/etudiant/mes-repas" });
    expect(forStudent[0].body).toContain("Blanquette");
    expect(forStudent[0].body).toContain("Mireille");
    const forHost = await listNotifications(db, host.userId);
    expect(forHost[0]).toMatchObject({ type: "reminder", link: "/hote/offres" });
    expect(forHost[0].body).toContain("Léa");
    expect(await countUnread(db, pending.userId)).toBe(0);
  });

  it("peut se limiter à un utilisateur et résiste aux appels simultanés", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile();
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId, { seatsTotal: 2, startsAt: new Date(Date.now() + 5 * HOUR) });
    await makeBooking(meal.id, s1.userId, "accepted");
    await makeBooking(meal.id, s2.userId, "accepted");
    expect(await ensureReminders(db, { userId: s1.userId })).toBe(1);
    expect(await countUnread(db, s2.userId)).toBe(0);
    const results = await Promise.all([ensureReminders(db, { userId: s2.userId }), ensureReminders(db, { userId: s2.userId })]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await countUnread(db, s2.userId)).toBe(1);
  });

  it("ne crée rien pour un repas déjà commencé", async () => {
    const host = await makeProfile({ role: "host" });
    const s = await makeProfile();
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() - HOUR) });
    await makeBooking(meal.id, s.userId, "accepted");
    expect(await ensureReminders(db, {})).toBe(0);
  });
});
```

Run: `npm run test:integration -- tests/integration/notifications.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/server/notifications/service.ts` :

```ts
import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { bookings, meals, notifications, profiles } from "@/db/schema";
import { formatMealDate } from "@/domain/dates";
import type { NotificationType } from "@/domain/types";
import type { Tx } from "@/server/meals/service";

export const REMINDER_WINDOW_HOURS = 24;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  dedupeKey?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  createdAt: Date;
  read: boolean;
}

export async function queueNotifications(db: Db | Tx, items: NotificationInput[]): Promise<void> {
  if (items.length === 0) return;
  await db
    .insert(notifications)
    .values(items.map((i) => ({ ...i, dedupeKey: i.dedupeKey ?? null })))
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

export async function listNotifications(db: Db, userId: string, limit = 30): Promise<NotificationItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(({ readAt, ...n }) => ({ ...n, read: readAt !== null }));
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function markAllRead(db: Db, userId: string, now = new Date()): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

const hostProfile = alias(profiles, "reminder_host");
const studentProfile = alias(profiles, "reminder_student");

// Rappel « la veille » : tout repas accepté qui commence dans les 24 prochaines heures.
// Idempotent grâce à dedupe_key, donc utilisable à chaque affichage de page comme depuis le cron.
export async function ensureReminders(db: Db, options: { userId?: string; now?: Date }): Promise<number> {
  const now = options.now ?? new Date();
  const until = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3600 * 1000);
  const conditions = [
    eq(bookings.status, "accepted"),
    eq(meals.status, "open"),
    gt(meals.startsAt, now),
    lte(meals.startsAt, until),
  ];
  if (options.userId) conditions.push(or(eq(meals.hostId, options.userId), eq(bookings.studentId, options.userId))!);
  const rows = await db
    .select({
      bookingId: bookings.id,
      studentId: bookings.studentId,
      hostId: meals.hostId,
      title: meals.title,
      startsAt: meals.startsAt,
      neighborhood: meals.neighborhood,
      hostFirstName: hostProfile.firstName,
      studentFirstName: studentProfile.firstName,
    })
    .from(bookings)
    .innerJoin(meals, eq(meals.id, bookings.mealId))
    .innerJoin(hostProfile, eq(hostProfile.userId, meals.hostId))
    .innerJoin(studentProfile, eq(studentProfile.userId, bookings.studentId))
    .where(and(...conditions));

  const items: NotificationInput[] = [];
  for (const r of rows) {
    const when = formatMealDate(r.startsAt);
    if (!options.userId || options.userId === r.studentId) {
      items.push({
        userId: r.studentId,
        type: "reminder",
        title: "Rappel : votre repas approche",
        body: `« ${r.title} » chez ${r.hostFirstName}, ${when} (${r.neighborhood}). L'adresse est dans Mes repas.`,
        link: "/etudiant/mes-repas",
        dedupeKey: `reminder:${r.bookingId}:${r.studentId}`,
      });
    }
    if (!options.userId || options.userId === r.hostId) {
      items.push({
        userId: r.hostId,
        type: "reminder",
        title: "Rappel : vous recevez bientôt",
        body: `${r.studentFirstName} vient partager « ${r.title} », ${when}.`,
        link: "/hote/offres",
        dedupeKey: `reminder:${r.bookingId}:${r.hostId}`,
      });
    }
  }
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(notifications)
    .values(items)
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return inserted.length;
}
```

- [ ] **Step 3: Lancer**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/notifications tests/integration/notifications.test.ts
git commit -m "feat: service des notifications et rappels de la veille

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Notifications émises par les événements métier

**Files:**
- Modify: `src/server/bookings/service.ts` (`requestBooking`, `decideBooking`, `cancelBooking`), `src/server/meals/service.ts` (`cancelMeal`), `src/server/reports/service.ts` (`suspendUser`, `resolveReport`), `src/server/verification/service.ts` (`reviewCard`)
- Test: `tests/integration/notifications-events.test.ts`

**Interfaces:**
- Consumes: `queueNotifications` (Task 2) ; `loadBookingContext` (Plan 3a).
- Produces: aucune nouvelle signature. Chaque fonction ci-dessus crée ses notifications dans sa transaction. `suspendUser(tx, userId, adminId, now)` prend maintenant l'id de l'admin et l'enregistre dans `cancelledBy`.

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/integration/notifications-events.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, notifications } from "@/db/schema";
import { cancelBooking, decideBooking, requestBooking } from "@/server/bookings/service";
import { cancelMeal } from "@/server/meals/service";
import { createReport, resolveReport } from "@/server/reports/service";
import { reviewCard, submitStudentCard } from "@/server/verification/service";
import { createMemoryStorage } from "@/services/storage";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

async function inbox(userId: string) {
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

beforeEach(resetDb);
afterAll(closeDb);

describe("notifications des réservations", () => {
  it("prévient l'hôte d'une demande, puis l'étudiant de l'acceptation, sans adresse", async () => {
    const host = await makeProfile({ role: "host", firstName: "Mireille" });
    const student = await makeProfile({ firstName: "Léa" });
    const meal = await makeMeal(host.userId, { title: "Blanquette" });
    const { id } = await requestBooking(db, student, meal.id, { message: "Bonjour" });
    const [forHost] = await inbox(host.userId);
    expect(forHost).toMatchObject({ type: "booking_requested", link: "/hote/offres", emailStatus: "pending" });
    expect(forHost.body).toContain("Léa");
    expect(forHost.body).toContain("Blanquette");

    await decideBooking(db, host, id, "accept");
    const [forStudent] = await inbox(student.userId);
    expect(forStudent).toMatchObject({ type: "booking_accepted", link: "/etudiant/mes-repas" });
    expect(`${forStudent.title} ${forStudent.body}`).not.toContain("rue Notre-Dame");
  });

  it("prévient l'étudiant d'un refus et l'hôte d'une annulation de venue, avec le motif", async () => {
    const host = await makeProfile({ role: "host" });
    const s1 = await makeProfile({ firstName: "Karim" });
    const s2 = await makeProfile();
    const meal = await makeMeal(host.userId);
    const b1 = await makeBooking(meal.id, s1.userId, "accepted");
    const b2 = await makeBooking(meal.id, s2.userId, "pending");
    await decideBooking(db, host, b2.id, "decline");
    expect((await inbox(s2.userId))[0].type).toBe("booking_declined");
    await cancelBooking(db, s1, b1.id, { reason: "Partiel déplacé" });
    const [forHost] = await inbox(host.userId);
    expect(forHost.type).toBe("booking_cancelled");
    expect(forHost.body).toContain("Karim");
    expect(forHost.body).toContain("Partiel déplacé");
  });

  it("prévient seulement les étudiants concernés quand l'hôte annule un repas", async () => {
    const host = await makeProfile({ role: "host" });
    const [accepted, pending, declined] = [await makeProfile(), await makeProfile(), await makeProfile()];
    const meal = await makeMeal(host.userId, { seatsTotal: 3, title: "Couscous" });
    await makeBooking(meal.id, accepted.userId, "accepted");
    await makeBooking(meal.id, pending.userId, "pending");
    await makeBooking(meal.id, declined.userId, "declined");
    await cancelMeal(db, host, meal.id, { reason: "Four en panne" });
    for (const s of [accepted, pending]) {
      const [n] = await inbox(s.userId);
      expect(n).toMatchObject({ type: "meal_cancelled" });
      expect(n.body).toContain("Four en panne");
    }
    expect(await inbox(declined.userId)).toHaveLength(0);
    expect(await inbox(host.userId)).toHaveLength(0);
  });

  it("ne crée aucune notification quand l'action échoue", async () => {
    const host = await makeProfile({ role: "host" });
    const unverified = await makeProfile({ verificationStatus: "none" });
    const meal = await makeMeal(host.userId);
    await expect(requestBooking(db, unverified, meal.id, {})).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    expect(await db.select().from(notifications)).toHaveLength(0);
  });
});

describe("notifications de modération et de vérification", () => {
  it("prévient l'autre participant d'une annulation par l'équipe, et enregistre l'admin comme auteur", async () => {
    const admin = await makeProfile({ role: "admin" });
    const host = await makeProfile({ role: "host" });
    const student = await makeProfile();
    const meal = await makeMeal(host.userId);
    const booking = await makeBooking(meal.id, student.userId, "accepted");
    const { id } = await createReport(db, host, booking.id, { reason: "Comportement inacceptable" });
    await resolveReport(db, admin, id, "suspend");
    const [n] = await inbox(host.userId);
    expect(n).toMatchObject({ type: "cancelled_by_team", link: "/hote/offres" });
    expect(`${n.title} ${n.body}`).not.toMatch(/suspen|signal/i);
    expect(await inbox(student.userId)).toHaveLength(0);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.cancelledBy).toBe(admin.userId);
  });

  it("prévient l'étudiant du résultat de la vérification de sa carte", async () => {
    const storage = createMemoryStorage();
    const adminId = await makeAuthUser("admin@example.com");
    const admin = await makeProfile({ userId: adminId, role: "admin" });
    const userId = await makeAuthUser("chloe@gmail.com");
    const student = await makeProfile({ userId, verificationStatus: "none" });
    const { id } = await submitStudentCard(db, storage, student, { school: "kedge", studentNumber: "12345678" }, { type: "image/png", size: 10, bytes: new Uint8Array(10) });
    await reviewCard(db, storage, admin, id, "reject", { reason: "Photo floue" });
    const [n] = await inbox(student.userId);
    expect(n).toMatchObject({ type: "verification_rejected", link: "/etudiant/verification" });
    expect(n.body).toContain("Photo floue");
  });
});
```

Run: `npm run test:integration -- tests/integration/notifications-events.test.ts`
Expected: FAIL (aucune notification créée).

- [ ] **Step 2: Réservations**

Dans `src/server/bookings/service.ts`, importer `queueNotifications` depuis `@/server/notifications/service` et `profiles` (déjà importé), puis :

1. Dans `requestBooking`, juste avant `return row;` à l'intérieur de la transaction :

```ts
    const [student] = await tx.select({ firstName: profiles.firstName }).from(profiles).where(eq(profiles.userId, actor.userId));
    await queueNotifications(tx, [
      {
        userId: meal.hostId,
        type: "booking_requested",
        title: "Nouvelle demande",
        body: `${student?.firstName ?? "Un étudiant"} aimerait partager « ${meal.title} ».`,
        link: "/hote/offres",
      },
    ]);
```

2. Dans `decideBooking`, après l'`update` du statut et avant `return { status };` :

```ts
    const ctx = await loadBookingContext(tx, bookingId);
    if (ctx) {
      await queueNotifications(tx, [
        decision === "accept"
          ? {
              userId: ctx.studentId,
              type: "booking_accepted",
              title: "Demande acceptée !",
              body: `${ctx.hostFirstName} vous attend pour « ${ctx.mealTitle} ». L'adresse est dans Mes repas.`,
              link: "/etudiant/mes-repas",
            }
          : {
              userId: ctx.studentId,
              type: "booking_declined",
              title: "Demande non retenue",
              body: `${ctx.hostFirstName} ne peut pas vous accueillir pour « ${ctx.mealTitle} ». D'autres repas vous attendent !`,
              link: "/repas",
            },
      ]);
    }
```

3. Dans `cancelBooking`, après l'`update` :

```ts
    await queueNotifications(tx, [
      {
        userId: ctx.hostId,
        type: "booking_cancelled",
        title: "Une venue est annulée",
        body: `${ctx.studentFirstName} ne pourra pas venir à « ${ctx.mealTitle} » : ${reason}`,
        link: "/hote/offres",
      },
    ]);
```

- [ ] **Step 3: Annulation d'un repas**

Dans `src/server/meals/service.ts`, importer `queueNotifications`, puis, dans `cancelMeal`, remplacer la mise à jour des réservations par :

```ts
    const affected = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: actor.userId, cancelReason: reason })
      .where(and(eq(bookings.mealId, mealId), inArray(bookings.status, ["pending", "accepted"])))
      .returning({ studentId: bookings.studentId });
    await queueNotifications(
      tx,
      affected.map((b) => ({
        userId: b.studentId,
        type: "meal_cancelled" as const,
        title: "Repas annulé",
        body: `« ${meal.title} » est annulé par l'hôte : ${reason}`,
        link: "/etudiant/mes-repas",
      })),
    );
```

(le commentaire « Règle 4 » reste au-dessus).

- [ ] **Step 4: Suspension**

Dans `src/server/reports/service.ts`, importer `queueNotifications`, puis :
1. `suspendUser(tx, userId, now)` devient `suspendUser(tx: Tx, userId: string, adminId: string, now: Date)`, et l'appel dans `resolveReport` devient `await suspendUser(tx, report.reportedUserId, actor.userId, now);`.
2. Dans `suspendUser`, la mise à jour des réservations des repas de l'hôte devient :

```ts
    const hostBookings = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledBy: adminId, cancelReason: SUSPENSION_REASON })
      .where(and(inArray(bookings.mealId, mealIds), inArray(bookings.status, ["pending", "accepted"])))
      .returning({ studentId: bookings.studentId });
    await queueNotifications(
      tx,
      hostBookings.map((b) => ({
        userId: b.studentId,
        type: "cancelled_by_team" as const,
        title: "Repas annulé",
        body: `Un repas que vous aviez demandé a été ${SUSPENSION_REASON.toLowerCase()}.`,
        link: "/etudiant/mes-repas",
      })),
    );
```

3. La mise à jour des demandes de l'étudiant suspendu devient :

```ts
  const studentBookings = await tx
    .update(bookings)
    .set({ status: "cancelled", cancelledBy: adminId, cancelReason: SUSPENSION_REASON })
    .where(
      and(eq(bookings.studentId, userId), inArray(bookings.status, ["pending", "accepted"]), inArray(bookings.mealId, upcomingForStudent)),
    )
    .returning({ mealId: bookings.mealId });
  if (studentBookings.length > 0) {
    const hosts = await tx
      .select({ hostId: meals.hostId })
      .from(meals)
      .where(inArray(meals.id, studentBookings.map((b) => b.mealId)));
    await queueNotifications(
      tx,
      hosts.map((h) => ({
        userId: h.hostId,
        type: "cancelled_by_team" as const,
        title: "Une demande a été annulée",
        body: `Une demande pour l'un de vos repas a été ${SUSPENSION_REASON.toLowerCase()}.`,
        link: "/hote/offres",
      })),
    );
  }
```

4. La mise à jour des repas de l'hôte suspendu ne touche plus que les repas encore ouverts : `.where(and(inArray(meals.id, mealIds), eq(meals.status, "open")))`. C'est une correction reportée du Plan 3a.

- [ ] **Step 5: Résultat de vérification**

Dans `src/server/verification/service.ts`, importer `queueNotifications`. Dans `reviewCard`, à l'intérieur de la transaction, juste avant `return v.cardObjectKey;` :

```ts
    await queueNotifications(tx, [
      decision === "approve"
        ? {
            userId: v.userId,
            type: "verification_approved",
            title: "Statut étudiant vérifié",
            body: "Votre carte étudiante a été validée. Vous pouvez demander à partager des repas !",
            link: "/repas",
          }
        : {
            userId: v.userId,
            type: "verification_rejected",
            title: "Carte étudiante refusée",
            body: `Votre carte n'a pas pu être validée : ${reason}. Vous pouvez en envoyer une nouvelle.`,
            link: "/etudiant/verification",
          },
    ]);
```

- [ ] **Step 6: Lancer**

Run: `npx tsc --noEmit && npm run test:integration`
Expected: PASS (toutes les suites, y compris `reports.test.ts`, dont les assertions sur `cancelReason` restent valables).

- [ ] **Step 7: Commit**

```bash
git add src/server tests/integration/notifications-events.test.ts
git commit -m "feat: notifications des demandes, annulations, modération et vérification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Envoi des emails (mode log ou Resend)

**Files:**
- Create: `src/services/email.ts`, `src/server/notifications/delivery.ts`
- Test: `src/services/email.test.ts`, `tests/integration/email-delivery.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `notifications` ; `getAuthIdentity` (Plan 2).
- Produces:
  - `interface EmailMessage { to: string; subject: string; text: string }`, `interface EmailSender { readonly mode: "log" | "resend"; send(message: EmailMessage): Promise<void> }`
  - `maskEmail(email: string): string`, `renderEmail(n: { title: string; body: string; link: string }, appUrl: string): { subject: string; text: string }`
  - `createLogEmailSender(log?: (line: string) => void): EmailSender`, `createResendEmailSender({ apiKey, from, fetchImpl? }): EmailSender`, `getEmailSender(env?): EmailSender`
  - `deliverPendingEmails(db, sender, { appUrl, limit? }): Promise<{ sent: number; failed: number; skipped: number }>`
  - `scheduleEmailDelivery(): void` (appelle `after()` dans une Server Action)

- [ ] **Step 1: Tests unitaires (échouent)**

`src/services/email.test.ts` :

```ts
import { describe, expect, it, vi } from "vitest";
import { createLogEmailSender, createResendEmailSender, getEmailSender, maskEmail, renderEmail } from "./email";

describe("maskEmail", () => {
  it("ne garde que la première lettre et le domaine", () => {
    expect(maskEmail("lea.martin@etu.u-bordeaux.fr")).toBe("l***@etu.u-bordeaux.fr");
    expect(maskEmail("pas-une-adresse")).toBe("***");
  });
});

describe("renderEmail", () => {
  it("compose sujet et texte avec un lien absolu", () => {
    const mail = renderEmail({ title: "Demande acceptée !", body: "Mireille vous attend.", link: "/etudiant/mes-repas" }, "https://ocleans-demo.vercel.app/");
    expect(mail.subject).toBe("Ocleans — Demande acceptée !");
    expect(mail.text).toContain("Mireille vous attend.");
    expect(mail.text).toContain("https://ocleans-demo.vercel.app/etudiant/mes-repas");
  });
});

describe("expéditeurs", () => {
  it("le mode log n'écrit ni le texte ni l'adresse complète", async () => {
    const lines: string[] = [];
    const sender = createLogEmailSender((l) => lines.push(l));
    await sender.send({ to: "lea@etu.u-bordeaux.fr", subject: "Ocleans — Rappel", text: "18 rue secrète" });
    expect(sender.mode).toBe("log");
    expect(lines.join("\n")).toContain("l***@etu.u-bordeaux.fr");
    expect(lines.join("\n")).toContain("Ocleans — Rappel");
    expect(lines.join("\n")).not.toContain("18 rue secrète");
  });

  it("le mode Resend appelle l'API et signale une erreur HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("bad", { status: 422 }));
    const sender = createResendEmailSender({ apiKey: "re_test", from: "Ocleans <bonjour@ocleans.fr>", fetchImpl });
    await sender.send({ to: "a@b.fr", subject: "S", text: "T" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body)).toEqual({ from: "Ocleans <bonjour@ocleans.fr>", to: ["a@b.fr"], subject: "S", text: "T" });
    expect(init.headers.Authorization).toBe("Bearer re_test");
    await expect(sender.send({ to: "a@b.fr", subject: "S", text: "T" })).rejects.toThrow("422");
  });

  it("choisit Resend seulement si la clé et l'expéditeur sont définis", () => {
    expect(getEmailSender({}).mode).toBe("log");
    expect(getEmailSender({ RESEND_API_KEY: "re_x" }).mode).toBe("log");
    expect(getEmailSender({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.fr" }).mode).toBe("resend");
  });
});
```

Run: `npm test -- src/services/email.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter l'envoi**

`src/services/email.ts` :

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly mode: "log" | "resend";
  send(message: EmailMessage): Promise<void>;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function renderEmail(n: { title: string; body: string; link: string }, appUrl: string): { subject: string; text: string } {
  const url = new URL(n.link, appUrl).toString();
  return {
    subject: `Ocleans — ${n.title}`,
    text: `${n.body}\n\nVoir sur Ocleans : ${url}\n\n— L'équipe Ocleans`,
  };
}

// Sans domaine configuré : on journalise seulement l'essentiel, jamais le texte (il peut contenir des données personnelles).
export function createLogEmailSender(log: (line: string) => void = (l) => console.info(l)): EmailSender {
  return {
    mode: "log",
    async send(message) {
      log(`[email:log] à ${maskEmail(message.to)} — ${message.subject}`);
    },
  };
}

export function createResendEmailSender(cfg: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailSender {
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    mode: "resend",
    async send(message) {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: cfg.from, to: [message.to], subject: message.subject, text: message.text }),
      });
      if (!response.ok) throw new Error(`Resend a répondu ${response.status}`);
    },
  };
}

export function getEmailSender(env: Record<string, string | undefined> = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return createResendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  return createLogEmailSender();
}
```

Run: `npm test -- src/services/email.test.ts`
Expected: PASS.

- [ ] **Step 3: Test de livraison (échoue)**

`tests/integration/email-delivery.test.ts` :

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { deliverPendingEmails } from "@/server/notifications/delivery";
import { queueNotifications } from "@/server/notifications/service";
import type { EmailMessage, EmailSender } from "@/services/email";
import { closeDb, db, makeAuthUser, makeProfile, resetDb } from "./helpers";

function recordingSender(fail = false): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    mode: "resend",
    sent,
    async send(message) {
      if (fail) throw new Error("fournisseur indisponible");
      sent.push(message);
    },
  };
}

beforeEach(resetDb);
afterAll(closeDb);

describe("deliverPendingEmails", () => {
  it("envoie les notifications en attente à l'adresse du compte puis les marque envoyées", async () => {
    const userId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    await makeProfile({ userId });
    await queueNotifications(db, [{ userId, type: "booking_accepted", title: "Demande acceptée !", body: "Mireille vous attend.", link: "/etudiant/mes-repas" }]);
    const sender = recordingSender();
    expect(await deliverPendingEmails(db, sender, { appUrl: "https://ocleans-demo.vercel.app" })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sender.sent[0]).toMatchObject({ to: "lea@etu.u-bordeaux.fr", subject: "Ocleans — Demande acceptée !" });
    const [n] = await db.select().from(notifications);
    expect(n.emailStatus).toBe("sent");
    expect(n.emailedAt).not.toBeNull();
    expect(await deliverPendingEmails(db, sender, { appUrl: "https://x" })).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("marque failed sans lever d'erreur si le fournisseur échoue, et skipped sans adresse", async () => {
    const userId = await makeAuthUser("karim@example.com");
    await makeProfile({ userId });
    const orphan = await makeProfile();
    await queueNotifications(db, [
      { userId, type: "booking_declined", title: "Refus", body: "…", link: "/repas" },
      { userId: orphan.userId, type: "booking_declined", title: "Refus", body: "…", link: "/repas" },
    ]);
    expect(await deliverPendingEmails(db, recordingSender(true), { appUrl: "https://x" })).toEqual({ sent: 0, failed: 1, skipped: 1 });
    const [failed] = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(failed.emailStatus).toBe("failed");
    const [skipped] = await db.select().from(notifications).where(eq(notifications.userId, orphan.userId));
    expect(skipped.emailStatus).toBe("skipped");
  });
});
```

Run: `npm run test:integration -- tests/integration/email-delivery.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 4: Implémenter la livraison**

`src/server/notifications/delivery.ts` :

```ts
import { asc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { getEmailSender, renderEmail, type EmailSender } from "@/services/email";
import { getAuthIdentity } from "@/server/auth-identity";

export async function deliverPendingEmails(
  db: Db,
  sender: EmailSender,
  options: { appUrl: string; limit?: number },
): Promise<{ sent: number; failed: number; skipped: number }> {
  // Réservation atomique : deux livraisons simultanées ne traitent pas la même notification.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, body: notifications.body, link: notifications.link })
      .from(notifications)
      .where(eq(notifications.emailStatus, "pending"))
      .orderBy(asc(notifications.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (rows.length > 0) {
      await tx.update(notifications).set({ emailStatus: "skipped" }).where(inArray(notifications.id, rows.map((r) => r.id)));
    }
    return rows;
  });

  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const n of claimed) {
    const identity = await getAuthIdentity(db, n.userId);
    if (!identity) {
      result.skipped += 1;
      continue;
    }
    try {
      await sender.send({ to: identity.email, ...renderEmail(n, options.appUrl) });
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date() }).where(eq(notifications.id, n.id));
      result.sent += 1;
    } catch (error) {
      console.warn("[email] échec d'envoi", n.id, error);
      await db.update(notifications).set({ emailStatus: "failed" }).where(eq(notifications.id, n.id));
      result.failed += 1;
    }
  }
  return result;
}

export function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// À appeler en fin de Server Action : l'envoi se fait après la réponse, sans ralentir l'utilisateur.
export function scheduleEmailDelivery(): void {
  after(async () => {
    try {
      await deliverPendingEmails(getDb(), getEmailSender(), { appUrl: appUrl() });
    } catch (error) {
      console.warn("[email] livraison différée en échec", error);
    }
  });
}
```

Run: `npm run test:integration -- tests/integration/email-delivery.test.ts`
Expected: PASS. Si Vitest ne résout pas `next/server` dans ce test, ce qui est peu probable, déplacer `scheduleEmailDelivery` et `appUrl` dans `src/server/notifications/schedule.ts` et ajuster les imports des Tasks 5 et 7.

- [ ] **Step 5: Variables**

Ajouter à `.env.example` :

```bash
# URL publique utilisée dans les liens des emails
APP_URL=http://localhost:3000
# Secret du cron quotidien (Vercel l'envoie en Authorization: Bearer)
CRON_SECRET=
# Optionnel : envoi réel par Resend, nécessite un domaine vérifié. Sans ces deux variables, mode "log".
RESEND_API_KEY=
EMAIL_FROM=
```

Ajouter à `.env.local` : `APP_URL='http://localhost:3000'` et `CRON_SECRET='<openssl rand -hex 24>'` (valeur générée, entre guillemets simples).

- [ ] **Step 6: Commit**

```bash
git add src/services/email.ts src/services/email.test.ts src/server/notifications/delivery.ts tests/integration/email-delivery.test.ts .env.example
git commit -m "feat: envoi des emails de notification (mode log ou Resend)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cron quotidien

**Files:**
- Create: `src/app/api/cron/daily/route.ts`, `src/server/cron.ts`, `vercel.json`
- Test: `tests/integration/cron.test.ts`

**Interfaces:**
- Consumes: `ensureReminders` (Task 2), `deliverPendingEmails`, `appUrl` (Task 4), `getEmailSender`.
- Produces:
  - `isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean`
  - `runDailyJob(db, sender, { appUrl, now? }): Promise<{ reminders: number; emails: { sent; failed; skipped } }>`
  - `GET /api/cron/daily` (401 sans le bon secret)

- [ ] **Step 1: Tests (échouent)**

`tests/integration/cron.test.ts` :

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import { isAuthorizedCron, runDailyJob } from "@/server/cron";
import { createLogEmailSender } from "@/services/email";
import { closeDb, db, makeAuthUser, makeBooking, makeMeal, makeProfile, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(closeDb);

describe("cron quotidien", () => {
  it("n'accepte que le bon secret, jamais un secret vide", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer autre", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });

  it("crée les rappels du lendemain puis envoie les emails en attente", async () => {
    const hostId = await makeAuthUser("mireille@example.com");
    const host = await makeProfile({ userId: hostId, role: "host" });
    const studentId = await makeAuthUser("lea@etu.u-bordeaux.fr", true);
    const student = await makeProfile({ userId: studentId });
    const meal = await makeMeal(host.userId, { startsAt: new Date(Date.now() + 6 * 3600 * 1000) });
    await makeBooking(meal.id, student.userId, "accepted");
    const lines: string[] = [];
    const result = await runDailyJob(db, createLogEmailSender((l) => lines.push(l)), { appUrl: "https://x" });
    expect(result).toEqual({ reminders: 2, emails: { sent: 2, failed: 0, skipped: 0 } });
    expect(lines).toHaveLength(2);
    expect((await db.select().from(notifications)).every((n) => n.emailStatus === "sent")).toBe(true);
  });
});
```

Run: `npm run test:integration -- tests/integration/cron.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/server/cron.ts` :

```ts
import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/db/client";
import type { EmailSender } from "@/services/email";
import { deliverPendingEmails } from "@/server/notifications/delivery";
import { ensureReminders } from "@/server/notifications/service";

export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function runDailyJob(db: Db, sender: EmailSender, options: { appUrl: string; now?: Date }) {
  const reminders = await ensureReminders(db, { now: options.now });
  const emails = await deliverPendingEmails(db, sender, { appUrl: options.appUrl, limit: 500 });
  return { reminders, emails };
}
```

`src/app/api/cron/daily/route.ts` :

```ts
import { getDb } from "@/db/client";
import { getEmailSender } from "@/services/email";
import { isAuthorizedCron, runDailyJob } from "@/server/cron";
import { appUrl } from "@/server/notifications/delivery";

// Déclenché chaque jour par Vercel Cron, en Production uniquement (vercel.json).
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Non autorisé", { status: 401 });
  }
  const result = await runDailyJob(getDb(), getEmailSender(), { appUrl: appUrl() });
  return Response.json(result);
}
```

`vercel.json` :

```json
{
  "crons": [{ "path": "/api/cron/daily", "schedule": "0 7 * * *" }]
}
```

(7 h UTC, soit 8 h ou 9 h à Paris.)

- [ ] **Step 3: Lancer**

Run: `npm run test:integration && npm run build`
Expected: PASS ; le build liste `ƒ /api/cron/daily`.

Vérification HTTP (`npm run dev`) : `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/daily` renvoie `401`. Avec `-H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d "'")"`, on obtient `200` et un JSON `{ reminders, emails }`.

- [ ] **Step 4: Commit**

```bash
git add src/server/cron.ts src/app/api/cron vercel.json tests/integration/cron.test.ts
git commit -m "feat: cron quotidien des rappels et des emails (Production)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coordonnées des quartiers

**Files:**
- Create: `src/config/neighborhood-coordinates.ts`
- Test: `src/config/neighborhood-coordinates.test.ts`

**Interfaces:**
- Consumes: `NEIGHBORHOODS`, `type Neighborhood` (Plan 1).
- Produces:
  - `NEIGHBORHOOD_COORDINATES: Record<Neighborhood, { lat: number; lng: number }>`
  - `BORDEAUX_CENTER = { lat: 44.8378, lng: -0.5792 }`
  - `interface MapPoint { neighborhood: string; lat: number; lng: number; meals: { id: string; title: string; when: string; seatsLeft: number }[] }`
  - `groupMealsByNeighborhood(meals: { id; title; neighborhood; when; seatsLeft }[]): MapPoint[]` (ignore les quartiers inconnus)

- [ ] **Step 1: Test (échoue)**

`src/config/neighborhood-coordinates.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { NEIGHBORHOODS } from "./neighborhoods";
import { NEIGHBORHOOD_COORDINATES, groupMealsByNeighborhood } from "./neighborhood-coordinates";

describe("coordonnées des quartiers", () => {
  it("couvre chaque quartier, dans la métropole bordelaise", () => {
    for (const n of NEIGHBORHOODS) {
      const c = NEIGHBORHOOD_COORDINATES[n];
      expect(c, n).toBeDefined();
      expect(c.lat).toBeGreaterThan(44.7);
      expect(c.lat).toBeLessThan(44.95);
      expect(c.lng).toBeGreaterThan(-0.72);
      expect(c.lng).toBeLessThan(-0.45);
    }
  });

  it("regroupe les repas par quartier et ignore un quartier inconnu", () => {
    const points = groupMealsByNeighborhood([
      { id: "1", title: "Blanquette", neighborhood: "Chartrons", when: "samedi", seatsLeft: 1 },
      { id: "2", title: "Soupe", neighborhood: "Chartrons", when: "dimanche", seatsLeft: 2 },
      { id: "3", title: "Tajine", neighborhood: "Saint-Michel", when: "lundi", seatsLeft: 0 },
      { id: "4", title: "Mystère", neighborhood: "Atlantide", when: "jamais", seatsLeft: 1 },
    ]);
    expect(points.map((p) => [p.neighborhood, p.meals.length])).toEqual([
      ["Chartrons", 2],
      ["Saint-Michel", 1],
    ]);
    expect(points[0]).toMatchObject(NEIGHBORHOOD_COORDINATES.Chartrons);
  });
});
```

Run: `npm test -- src/config/neighborhood-coordinates.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 2: Implémenter**

`src/config/neighborhood-coordinates.ts` :

```ts
import { isNeighborhood, type Neighborhood } from "./neighborhoods";

// Centre approximatif de chaque quartier : la carte ne montre jamais l'adresse (règle 7).
export const NEIGHBORHOOD_COORDINATES: Record<Neighborhood, { lat: number; lng: number }> = {
  Bacalan: { lat: 44.874, lng: -0.554 },
  Chartrons: { lat: 44.853, lng: -0.572 },
  "Grand Parc": { lat: 44.858, lng: -0.583 },
  "Saint-Seurin": { lat: 44.843, lng: -0.589 },
  Caudéran: { lat: 44.848, lng: -0.615 },
  "Saint-Pierre": { lat: 44.84, lng: -0.572 },
  "Saint-Michel": { lat: 44.834, lng: -0.568 },
  Victoire: { lat: 44.831, lng: -0.573 },
  Capucins: { lat: 44.829, lng: -0.565 },
  Nansouty: { lat: 44.822, lng: -0.576 },
  "Saint-Augustin": { lat: 44.834, lng: -0.603 },
  Bastide: { lat: 44.842, lng: -0.556 },
  Talence: { lat: 44.808, lng: -0.59 },
  Pessac: { lat: 44.806, lng: -0.631 },
  Mérignac: { lat: 44.842, lng: -0.645 },
  Bègles: { lat: 44.808, lng: -0.548 },
  "Le Bouscat": { lat: 44.865, lng: -0.599 },
  Gradignan: { lat: 44.772, lng: -0.615 },
  Cenon: { lat: 44.857, lng: -0.531 },
  Floirac: { lat: 44.836, lng: -0.528 },
};

export const BORDEAUX_CENTER = { lat: 44.8378, lng: -0.5792 };

export interface MapPoint {
  neighborhood: string;
  lat: number;
  lng: number;
  meals: { id: string; title: string; when: string; seatsLeft: number }[];
}

export function groupMealsByNeighborhood(
  meals: { id: string; title: string; neighborhood: string; when: string; seatsLeft: number }[],
): MapPoint[] {
  const points = new Map<string, MapPoint>();
  for (const { neighborhood, ...meal } of meals) {
    if (!isNeighborhood(neighborhood)) continue;
    const point = points.get(neighborhood) ?? { neighborhood, ...NEIGHBORHOOD_COORDINATES[neighborhood], meals: [] };
    point.meals.push(meal);
    points.set(neighborhood, point);
  }
  return [...points.values()];
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/config/neighborhood-coordinates.ts src/config/neighborhood-coordinates.test.ts
git commit -m "feat: coordonnées des quartiers de Bordeaux

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Écrans de notifications

**Files:**
- Create: `src/server/notifications/actions.ts`, `src/components/mark-read-button.tsx`, `src/app/notifications/page.tsx`
- Modify: `src/components/site-header.tsx`, `src/domain/routes.ts`, `src/domain/routes.test.ts`, `src/server/bookings/actions.ts`, `src/server/meals/actions.ts`, `src/server/reports/actions.ts`, `src/server/verification/actions.ts`

**Interfaces:**
- Consumes: Task 2 (`listNotifications`, `countUnread`, `markAllRead`, `ensureReminders`), Task 4 (`scheduleEmailDelivery`).
- Produces: route protégée `/notifications` ; `markAllReadAction()` ; un badge de notifications non lues dans l'en-tête.

- [ ] **Step 1: Route protégée (test qui échoue)**

Dans `src/domain/routes.test.ts`, ajouter `expect(isProtectedPath("/notifications")).toBe(true);` au premier `it`. Lancer `npm test -- src/domain/routes.test.ts` : FAIL. Ajouter `"/notifications"` à `PROTECTED_PREFIXES` dans `src/domain/routes.ts`, puis relancer : PASS.

- [ ] **Step 2: Livraison des emails après chaque action qui notifie**

Ajouter `import { scheduleEmailDelivery } from "@/server/notifications/delivery";` et un appel `scheduleEmailDelivery();` juste avant le `return { ok: true };` (ou avant le `redirect`) de chaque action qui crée des notifications :
- `requestBookingAction`, `decideBookingAction`, `cancelBookingAction` (`src/server/bookings/actions.ts`) ;
- `cancelMealAction` (`src/server/meals/actions.ts`) ;
- `resolveReportAction` (`src/server/reports/actions.ts`) ;
- `reviewCardAction` (`src/server/verification/actions.ts`).

- [ ] **Step 3: Action et bouton**

`src/server/notifications/actions.ts` :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireProfile } from "@/server/session";
import { markAllRead } from "./service";

export async function markAllReadAction(): Promise<void> {
  const actor = await requireProfile();
  await markAllRead(getDb(), actor.userId);
  revalidatePath("/notifications");
}
```

`src/components/mark-read-button.tsx` :

```tsx
"use client";

import { useTransition } from "react";
import { markAllReadAction } from "@/server/notifications/actions";
import { Button } from "@/components/ui";

export function MarkReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => startTransition(() => markAllReadAction())}>
      {pending ? "…" : "Tout marquer comme lu"}
    </Button>
  );
}
```

- [ ] **Step 4: Page**

`src/app/notifications/page.tsx` :

```tsx
import Link from "next/link";
import { MarkReadButton } from "@/components/mark-read-button";
import { Card, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMessageTime } from "@/domain/dates";
import { ensureReminders, listNotifications } from "@/server/notifications/service";
import { requireProfile } from "@/server/session";

export default async function NotificationsPage() {
  const actor = await requireProfile();
  const db = getDb();
  await ensureReminders(db, { userId: actor.userId });
  const list = await listNotifications(db, actor.userId);
  const hasUnread = list.some((n) => !n.read);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {hasUnread && <MarkReadButton />}
      </div>
      {list.length === 0 && <p className="text-stone-600">Rien de nouveau pour l'instant.</p>}
      {list.map((n) => (
        <Link key={n.id} href={n.link} className="block">
          <Card className={cx("space-y-1 transition-shadow hover:shadow-md", !n.read && "border-orange-300 bg-orange-50")}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{n.title}</h2>
              <span className="whitespace-nowrap text-xs text-stone-500">{formatMessageTime(n.createdAt)}</span>
            </div>
            <p className="text-sm text-stone-700">{n.body}</p>
          </Card>
        </Link>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: En-tête**

Dans `src/components/site-header.tsx` :
1. Importer `getDb`, `countUnread` et `ensureReminders`.
2. Après `const profile = await getCurrentProfile();`, ajouter :

```tsx
  let unread = 0;
  if (profile && !profile.suspended) {
    const db = getDb();
    // Rappels « la veille » créés à l'affichage : les crons Vercel ne tournent qu'en Production.
    await ensureReminders(db, { userId: profile.userId });
    unread = await countUnread(db, profile.userId);
  }
```

3. Juste avant `<span className="text-stone-500">{profile.firstName}</span>`, ajouter :

```tsx
              <Link href="/notifications" className="relative" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
                🔔
                {unread > 0 && (
                  <span className="absolute -right-2 -top-1 rounded-full bg-orange-600 px-1.5 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
```

- [ ] **Step 6: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe.

Vérification manuelle (`npm run seed:demo`, `npm run dev`, Playwright MCP) :
1. Léa demande « Pâtes au pesto maison ». Connexion rapide Samira par formulaire (`samira.demo@example.com` / `DEMO_PASSWORD`) : la cloche affiche 1, et `/notifications` montre « Nouvelle demande » de Léa.
2. Samira accepte. Léa voit la cloche à 1, puis « Demande acceptée ! », sans adresse dans le texte ; le lien mène à « Mes repas ».
3. Les journaux du serveur de dev contiennent `[email:log] à l***@example.com — Ocleans — Demande acceptée !`, et rien d'autre de l'email.
4. « Tout marquer comme lu » : la cloche n'affiche plus de compteur.
5. `npm run seed:demo`.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: page des notifications, cloche dans l'en-tête et envoi différé des emails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Carte des repas

**Files:**
- Create: `src/components/meals-map.tsx`, `src/components/meals-map-inner.tsx`
- Modify: `src/app/repas/page.tsx`, `package.json`

**Interfaces:**
- Consumes: `groupMealsByNeighborhood`, `BORDEAUX_CENTER`, `MapPoint` (Task 6) ; `listUpcomingMeals` ; `formatMealDate`.
- Produces: `/repas?vue=carte` affiche la carte. Les filtres sont conservés, et l'on bascule entre liste et carte.

- [ ] **Step 1: Installer Leaflet**

```bash
npm install leaflet@1.9.4 && npm install -D @types/leaflet
```

- [ ] **Step 2: Composants**

`src/components/meals-map-inner.tsx` :

```tsx
"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { BORDEAUX_CENTER, type MapPoint } from "@/config/neighborhood-coordinates";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MealsMapInner({ points }: { points: MapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([BORDEAUX_CENTER.lat, BORDEAUX_CENTER.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
    }).addTo(map);
    for (const p of points) {
      // Cercle sur le centre du quartier : aucune adresse n'est révélée (règle 7).
      const marker = L.circleMarker([p.lat, p.lng], { radius: 10 + Math.min(p.meals.length, 5) * 2, color: "#c2410c", fillColor: "#ea580c", fillOpacity: 0.7 });
      const items = p.meals
        .map((m) => `<li><a href="/repas/${encodeURIComponent(m.id)}">${escapeHtml(m.title)}</a> — ${escapeHtml(m.when)}${m.seatsLeft === 0 ? " (complet)" : ""}</li>`)
        .join("");
      marker.bindPopup(`<strong>${escapeHtml(p.neighborhood)}</strong><ul style="margin:4px 0 0;padding-left:16px">${items}</ul>`);
      marker.bindTooltip(`${p.neighborhood} · ${p.meals.length} repas`);
      marker.addTo(map);
    }
    return () => {
      map.remove();
    };
  }, [points]);

  return <div ref={container} className="h-[60vh] min-h-80 w-full rounded-xl border border-stone-200" role="region" aria-label="Carte des repas à Bordeaux" />;
}
```

`src/components/meals-map.tsx` :

```tsx
"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "@/config/neighborhood-coordinates";

// Leaflet a besoin de window : chargement côté client uniquement.
const MealsMapInner = dynamic(() => import("./meals-map-inner"), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-80 w-full animate-pulse rounded-xl bg-stone-200" />,
});

export function MealsMap({ points }: { points: MapPoint[] }) {
  return <MealsMapInner points={points} />;
}
```

- [ ] **Step 3: Bascule liste / carte**

Dans `src/app/repas/page.tsx` :
1. Importer `Link`, `MealsMap`, `groupMealsByNeighborhood` et `formatMealDate`.
2. Après le calcul de `list`, ajouter :

```tsx
  const view = first(sp.vue) === "carte" ? "carte" : "liste";
  const params = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1])));
  const hrefFor = (v: "liste" | "carte") => {
    const p = new URLSearchParams(params);
    if (v === "carte") p.set("vue", "carte");
    const qs = p.toString();
    return qs ? `/repas?${qs}` : "/repas";
  };
  const points = groupMealsByNeighborhood(
    list.map((m) => ({ id: m.id, title: m.title, neighborhood: m.neighborhood, when: formatMealDate(m.startsAt), seatsLeft: m.seatsLeft })),
  );
```

3. Remplacer le bloc d'affichage `{list.length === 0 ? (…) : (…)}` par :

```tsx
      <div className="flex gap-2 text-sm" role="tablist" aria-label="Affichage">
        {(["liste", "carte"] as const).map((v) => (
          <Link
            key={v}
            href={hrefFor(v)}
            role="tab"
            aria-selected={view === v}
            className={view === v ? "rounded-full bg-orange-600 px-3 py-1 font-medium text-white" : "rounded-full border border-stone-300 bg-white px-3 py-1"}
          >
            {v === "liste" ? "Liste" : "Carte"}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-stone-600">Aucun repas ne correspond pour le moment. Revenez bientôt !</p>
      ) : view === "carte" ? (
        <>
          <MealsMap points={points} />
          <p className="text-xs text-stone-500">Chaque cercle représente un quartier. L'adresse exacte n'est donnée qu'après acceptation.</p>
        </>
      ) : (
        <div className="space-y-3">
          {list.map((meal) => <MealCard key={meal.id} meal={meal} />)}
        </div>
      )}
```

4. Dans `src/components/meal-filters.tsx`, conserver la vue courante dans le formulaire de filtres. Ajouter une prop `vue?: string`, et `{vue === "carte" && <input type="hidden" name="vue" value="carte" />}` dans le `<form>`. Dans la page, passer `vue={view}` à `<MealFilters … />`.

- [ ] **Step 4: Vérifier**

Run: `npm run lint && npx tsc --noEmit && npm run build && npm test`
Expected: tout passe (aucune erreur `window is not defined` au build).

Vérification manuelle (Playwright MCP, 390×844) :
1. `/repas?vue=carte` : la carte s'affiche, avec un cercle par quartier ayant des repas (Chartrons, Bastide, Caudéran, Saint-Michel, Talence). Dans le DOM, `document.querySelectorAll('.leaflet-interactive').length` vaut le nombre de quartiers.
2. Clic sur le cercle de Chartrons : la bulle liste ses repas, et un lien mène à la fiche. L'attribution OpenStreetMap est visible.
3. Filtrer par « Végétarien » en vue carte : l'URL garde `vue=carte`, et seuls les quartiers concernés restent.
4. L'onglet « Liste » ramène à la liste, filtres conservés. Aucun débordement horizontal.

- [ ] **Step 5: Commit**

```bash
git add src package.json package-lock.json
git commit -m "feat: carte des repas par quartier (Leaflet, OpenStreetMap)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Démo, déploiement et recette

**Files:**
- Modify: `scripts/seed-demo.ts`, `README.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: une démo publique avec quelques notifications et une carte.

- [ ] **Step 1: Seed**

Dans `scripts/seed-demo.ts`, ajouter `notifications` à l'import du schéma, puis :
1. Avant la suppression des repas : `await db.delete(notifications).where(inArray(notifications.userId, demoIds));`.
2. Après l'insertion des signalements :

```ts
  await db.insert(notifications).values([
    { userId: ids.get("mireille")!, type: "booking_requested", title: "Nouvelle demande", body: "Karim aimerait partager « Blanquette de veau ».", link: "/hote/offres", emailStatus: "skipped" },
    { userId: ids.get("lea")!, type: "booking_accepted", title: "Demande acceptée !", body: "Mireille vous attend pour « Blanquette de veau ». L'adresse est dans Mes repas.", link: "/etudiant/mes-repas", emailStatus: "skipped" },
    { userId: ids.get("lea")!, type: "booking_declined", title: "Demande non retenue", body: "Samira ne peut pas vous accueillir pour « Tajine poulet citron ». D'autres repas vous attendent !", link: "/repas", emailStatus: "skipped", readAt: new Date() },
  ]);
```

3. Message final : ajouter `, 3 notifications`.

Run: `npm run seed:demo && npm run seed:demo`
Expected: deux fois le même message. Avec `run_sql`, `select count(*) from notifications` renvoie `3`, plus d'éventuels rappels si un repas de démo commence dans moins de 24 h.

- [ ] **Step 2: Variables Vercel**

Pour `preview` et `development`, ajouter `APP_URL` (`https://ocleans-demo.vercel.app` en preview, `http://localhost:3000` en development) et `CRON_SECRET` (même valeur que `.env.local`, en `--sensitive` pour preview). Utiliser `grep … | cut … | sed`, jamais de `source`.

- [ ] **Step 3: README**

Ajouter une section :

````markdown
## Notifications et carte

- **Notifications** : la cloche de l'en-tête et `/notifications`. Elles sont créées dans la même transaction que l'événement (demande, acceptation, annulation, vérification, modération). Les rappels de la veille sont créés à l'affichage, et chaque jour par le cron `/api/cron/daily` en Production.
- **Emails** : mode « log » par défaut, qui journalise le destinataire masqué et le sujet. Pour un envoi réel, il faut un domaine vérifié chez Resend ; définir alors `RESEND_API_KEY` et `EMAIL_FROM`.
- **Carte** : `/repas?vue=carte`, avec un cercle par quartier (Leaflet, OpenStreetMap). L'adresse exacte n'apparaît jamais sur la carte.
````

- [ ] **Step 4: Déployer**

```bash
vercel deploy --target preview --yes
vercel alias set <url-affichée> ocleans-demo.vercel.app
```

- [ ] **Step 5: Recette en ligne (Playwright MCP, 390×844)**

1. Léa : la cloche affiche 1 (la notification d'acceptation du seed). `/notifications` liste ses 2 notifications, dont celle déjà lue sans surbrillance.
2. Léa demande « Curry de lentilles corail ». Hélène (formulaire, `helene.demo@example.com`) voit « Nouvelle demande », puis refuse. Léa reçoit « Demande non retenue ».
3. `/repas?vue=carte` : les cercles et la bulle s'affichent, le lien vers une fiche fonctionne, l'attribution est visible, sans débordement.
4. `curl -s -o /dev/null -w "%{http_code}" https://ocleans-demo.vercel.app/api/cron/daily` renvoie `401`.
5. Avec `vercel logs` (ou l'outil MCP `get_runtime_logs`), des lignes `[email:log] à …` apparaissent, sans aucune adresse complète.
6. `npm run seed:demo`.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-demo.ts README.md
git commit -m "feat: notifications de démonstration et documentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
