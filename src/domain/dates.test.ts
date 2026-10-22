import { describe, expect, it } from "vitest";
import {
  dateToParisLocal,
  formatMealDate,
  formatMessageTime,
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

describe("formatMessageTime", () => {
  it("affiche jour, mois abrégé et heure de Paris", () => {
    const text = formatMessageTime(new Date("2026-10-22T17:05:00Z"));
    expect(text).toContain("22");
    expect(text).toContain("oct");
    expect(text).toContain("19:05");
  });
});
