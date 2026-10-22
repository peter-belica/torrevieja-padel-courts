import { USER_AGENT } from "../http.js";
import { courtsLabel, slotMinutes, weekday } from "../time.js";
import { SourceError, type Calendar, type Court } from "../types.js";

const API = "https://www.novapadel.es/api/v1";
const LOCATION_ID = "a7e8e43b-c5e1-414f-926b-af737498769b"; // Outdoor NovaPark
const BOOKING_URL = "https://www.novapadel.es/user/new/outdoor-novapark";
const TIMEOUT_MS = 15_000;
const DEFAULT_SLOT_MINUTES = 90;
/** Po zlyhanom prihlásení to chvíľu neskúšame znova (web po 3 neúspešných pokusoch zapína captchu). */
const LOGIN_BACKOFF_MS = 10 * 60_000;
const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export interface NovaRoom {
  id: string;
  name: string;
}

export interface NovaHour {
  room: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  price: number;
  available: boolean;
  visible: boolean;
  enabled: boolean;
  availableDays: string | null;
}

// Držia sa medzi volaniami, kým je Vercel funkcia „teplá“.
let accessToken: { value: string; expiresAt: number } | null = null;
let loginBlockedUntil = 0;
let roomsCache: NovaRoom[] | null = null;

export async function fetchNovaPadel(date: string): Promise<Calendar> {
  roomsCache ??= await apiGet<NovaRoom[]>(`/appointment/room/${LOCATION_ID}`);
  const hours = await apiGet<NovaHour[]>(`/appointment/hour/available/${LOCATION_ID}/${date}`);
  const courts = parseNovaPadel(roomsCache, hours, date);
  return {
    source: "novapadel",
    title: "NovaPadel · Outdoor NovaPark",
    subtitle: `Padel · ${courtsLabel(courts.length)} · sloty po ${slotMinutes(courts, DEFAULT_SLOT_MINUTES)} min`,
    date,
    slotMinutes: slotMinutes(courts, DEFAULT_SLOT_MINUTES),
    links: [{ label: "Rezervovať na novapadel.es", url: BOOKING_URL }],
    courts,
    note: courts.some((c) => c.slots.length) ? undefined : "Na tento deň NovaPadel zatiaľ nič neponúka.",
    fetchedAt: new Date().toISOString(),
  };
}

export function parseNovaPadel(rooms: NovaRoom[], hours: NovaHour[], date: string): Court[] {
  const day = DAYS[weekday(date)];
  return [...rooms]
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }))
    .map((room) => ({
      id: room.id,
      name: room.name,
      slots: hours
        .filter((h) => h.room === room.id && h.enabled && h.visible)
        .map((h) => ({
          start: hhmm(h.startHour, h.startMinute),
          end: hhmm(h.endHour, h.endMinute),
          status: !offeredOn(h, day) ? ("na" as const) : h.available ? ("free" as const) : ("busy" as const),
          price: h.price,
        }))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }));
}

function offeredOn(hour: NovaHour, day: string): boolean {
  return !hour.availableDays || hour.availableDays.split(",").includes(day);
}

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function apiGet<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = accessToken && accessToken.expiresAt - 60_000 > Date.now() ? accessToken.value : await login();
    const res = await fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}`, "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 && attempt === 0) {
      accessToken = null;
      continue;
    }
    if (!res.ok) throw new SourceError(`NovaPadel: HTTP ${res.status}.`);
    return (await res.json()) as T;
  }
  throw new SourceError("NovaPadel: server odmietol prihlásenie.");
}

async function login(): Promise<string> {
  const username = process.env.NOVAPADEL_EMAIL;
  const password = process.env.NOVAPADEL_PASSWORD;
  if (!username || !password) {
    throw new SourceError("NovaPadel: chýbajú prihlasovacie údaje (NOVAPADEL_EMAIL, NOVAPADEL_PASSWORD).");
  }
  if (Date.now() < loginBlockedUntil) {
    throw new SourceError("NovaPadel: prihlásenie nedávno zlyhalo, ďalší pokus o pár minút.");
  }
  const res = await fetch(`${API}/authentication/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    loginBlockedUntil = Date.now() + LOGIN_BACKOFF_MS;
    throw new SourceError(`NovaPadel: prihlásenie zlyhalo (HTTP ${res.status}).`);
  }
  const { authToken } = (await res.json()) as { authToken?: string };
  if (!authToken) throw new SourceError("NovaPadel: prihlásenie nevrátilo token.");
  accessToken = { value: authToken, expiresAt: jwtExpiry(authToken) };
  return authToken;
}

function jwtExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (payload.exp) return payload.exp * 1000;
  } catch {
    // neštandardný token, použijeme konzervatívnu platnosť
  }
  return Date.now() + 5 * 60_000;
}
