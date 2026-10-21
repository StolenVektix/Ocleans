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
