import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { inArray, or, sql } from "drizzle-orm";
import type { DietTag } from "../src/config/diet-tags";
import { createDb } from "../src/db/client";
import { bookings, meals, messages, notifications, profiles, reports, reviews, verifications } from "../src/db/schema";
import { createNeonStorage, storageConfigFromEnv } from "../src/services/storage";
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
  { key: "thomas", email: "thomas.demo@example.com", firstName: "Thomas", role: "student", school: "Bordeaux INP", verificationStatus: "pending" },
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

  const demoIds = [...ids.values()];
  await db.delete(reports).where(or(inArray(reports.reporterId, demoIds), inArray(reports.reportedUserId, demoIds)));
  await db.delete(notifications).where(inArray(notifications.userId, demoIds));

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

  const bookingIds = new Map<string, string>();
  for (const b of BOOKINGS) {
    const [row] = await db
      .insert(bookings)
      .values({ mealId: mealIds.get(b.meal)!, studentId: ids.get(b.student)!, status: b.status, requestMessage: b.message })
      .returning({ id: bookings.id });
    bookingIds.set(`${b.meal}:${b.student}`, row.id);
  }

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

  await db.insert(notifications).values([
    { userId: ids.get("mireille")!, type: "booking_requested", title: "Nouvelle demande", body: "Karim aimerait partager « Blanquette de veau ».", link: "/hote/offres", emailStatus: "skipped" },
    { userId: ids.get("lea")!, type: "booking_accepted", title: "Demande acceptée !", body: "Mireille vous attend pour « Blanquette de veau ». L'adresse est dans Mes repas.", link: "/etudiant/mes-repas", emailStatus: "skipped" },
    { userId: ids.get("lea")!, type: "booking_declined", title: "Demande non retenue", body: "Samira ne peut pas vous accueillir pour « Tajine poulet citron ». D'autres repas vous attendent !", link: "/repas", emailStatus: "skipped", readAt: new Date() },
  ]);


  console.log(`Démo prête : ${PEOPLE.length} comptes, ${MEALS.length} repas, ${BOOKINGS.length} demandes, 1 carte à vérifier, 3 messages, 3 avis, 1 signalement, 3 notifications.`);
  await db.$client.end();
}

main().catch(async (error) => {
  console.error(error);
  await db.$client.end();
  process.exit(1);
});
