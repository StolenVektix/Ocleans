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

  it("masque l'adresse à un étudiant suspendu, même accepté", async () => {
    const host = await makeProfile({ role: "host" });
    const suspended = await makeProfile({ suspended: true });
    const meal = await makeMeal(host.userId);
    await makeBooking(meal.id, suspended.userId, "accepted");
    expect((await getMealForViewer(db, suspended, meal.id))?.address).toBeNull();
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
