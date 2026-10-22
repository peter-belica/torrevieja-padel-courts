import type { Court } from "./types.js";

const TIME_ZONE = "Europe/Madrid";
export const MAX_DAYS_AHEAD = 14;

export function madridNow(now = new Date()): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = nedeľa … 6 = sobota */
export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function isAllowedDate(date: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = madridNow(now).date;
  return date >= today && date <= addDays(today, MAX_DAYS_AHEAD);
}

/** Dnešné sloty, ktoré už začali, označí ako uplynulé. */
export function markPast(courts: Court[], date: string, now = new Date()): void {
  const { date: today, minutes } = madridNow(now);
  if (date !== today) return;
  for (const court of courts) {
    for (const slot of court.slots) {
      if (toMinutes(slot.start) <= minutes) slot.status = "past";
    }
  }
}

/** Dĺžka slotu podľa prvého kurtu, ktorý má aspoň jeden slot. */
export function slotMinutes(courts: Court[], fallback: number): number {
  const slot = courts.find((c) => c.slots.length)?.slots[0];
  return slot ? toMinutes(slot.end) - toMinutes(slot.start) : fallback;
}

/** 1 kurt, 2–4 kurty, 5+ kurtov */
export function courtsLabel(count: number): string {
  if (count === 1) return "1 kurt";
  if (count >= 2 && count <= 4) return `${count} kurty`;
  return `${count} kurtov`;
}
