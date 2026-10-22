import { decodeEntities, Session, type Page } from "../http.js";
import { courtsLabel, fromMinutes, toMinutes } from "../time.js";
import { SourceError, type Calendar, type Court, type SlotStatus } from "../types.js";

const BASE = "https://torreviejadeportes.i2a.es/CronosWeb";
const PREFIX = "ContentFixedSection_uReservaEspacios_";
const SLOT_MINUTES = 30;

/** Dve aktivity v systéme i2a Cronos pre tie isté kurty (Concejalía de Deportes, Av. Monge y Bielsa). */
const PERIODS = [
  { label: "ráno", token: "BF5395E4D6105EDBE4AAC24B01A57D718193B7638D1627A724B60BFCFB9F20D2" },
  { label: "poobede", token: "BF5395E4D6105EDB68EFB96CBE6346D8D32E6E233D5F4AC14121F1B1D0E9F6F9" },
];

const STATUS_BY_IMAGE: Record<string, SlotStatus> = { libre: "free", ocupado: "busy" };

export const reservaUrl = (token: string) =>
  `${BASE}/Modulos/VentaServicios/Alquileres/ReservaEspacios?token=${token}`;

export async function fetchTorrevieja(date: string): Promise<Calendar> {
  const periods = await Promise.all(PERIODS.map((p) => fetchPeriod(reservaUrl(p.token), date)));

  const byNumber = new Map<string, Court>();
  for (const { courts } of periods) {
    for (const court of courts) {
      const existing = byNumber.get(court.id);
      if (existing) existing.slots.push(...court.slots);
      else byNumber.set(court.id, court);
    }
  }
  const courts = [...byNumber.values()].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
  for (const court of courts) court.slots.sort((a, b) => a.start.localeCompare(b.start));

  return {
    source: "torrevieja",
    title: "Concejalía de Deportes Torrevieja",
    subtitle: `Padel · ${courtsLabel(courts.length)} · bunky po ${SLOT_MINUTES} min`,
    date,
    slotMinutes: SLOT_MINUTES,
    links: PERIODS.map((p) => ({ label: `Rezervovať ${p.label}`, url: reservaUrl(p.token) })),
    courts,
    note: periods.every((p) => !p.bookable)
      ? "Tento deň sa v Torrevieji ešte nedá rezervovať."
      : "Po otvorení rezervácie zvoľ spôsob prístupu. Ak ťa web nepresmeruje, otvor odkaz ešte raz.",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Zopakuje kroky, ktoré robí prehliadač v ASP.NET WebForms aplikácii:
 * anonymný prístup → stránka aktivity → výber centra → výber typu → dátum → mriežka.
 */
async function fetchPeriod(url: string, date: string): Promise<{ courts: Court[]; bookable: boolean }> {
  const session = new Session();

  let page = await session.get(`${BASE}/Login`);
  page = await postBack(session, page, "ContentFixedSection_uSecciones_uAlert_uplAlert", {
    action: "SelectMenu",
    args: { menu_code: "8", menu_title: "Acceso no identificado", menu_type: 30, submenu_code: null },
  });

  page = await session.get(url);
  if (!page.url.includes("ReservaEspacios")) throw new SourceError("Torrevieja: anonymný prístup nebol prijatý.");

  const facility = page.text.match(
    /action: 'SelectFacility', args: \{ menu_code: '(\d+)', facility_code: '(\d+)', activity: (\{[^}]*\})/,
  );
  if (!facility) throw new SourceError("Torrevieja: na stránke chýba výber centra.");
  page = await postBack(session, page, `${PREFIX}uCentrosSeleccionar_uAlert_uplAlert`, {
    action: "SelectFacility",
    args: { menu_code: facility[1], facility_code: facility[2], activity: JSON.parse(facility[3]) },
  });

  const typeJson = page.text.match(/reservationType: (\{[^}]*\})/)?.[1];
  if (typeJson) {
    const type = JSON.parse(typeJson) as { dates?: string[] };
    if (type.dates && !type.dates.includes(date)) return { courts: [], bookable: false };
    page = await postBack(session, page, `${PREFIX}uUsosSeleccionar_uAlert_uplAlert`, {
      action: "Seleccionar",
      args: type,
    });
  }

  page = await postBack(session, page, `${PREFIX}uFechaSeleccionar_uAlert_uplAlert`, {
    action: "Continuar",
    args: date,
  });
  const courts = parseTorrevieja(page.text, url);
  if (!courts.length) throw new SourceError("Torrevieja: v odpovedi chýba mriežka kurtov.");
  return { courts, bookable: true };
}

function postBack(session: Session, page: Page, target: string, argument: unknown): Promise<Page> {
  const form = new URLSearchParams(hiddenFields(page.text));
  form.set("__EVENTTARGET", target);
  form.set("__EVENTARGUMENT", JSON.stringify(argument));
  return session.post(page.url, form);
}

export function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*\btype="hidden"[^>]*>/gi)) {
    const name = tag.match(/\bname="([^"]*)"/)?.[1];
    if (name) fields[decodeEntities(name)] = decodeEntities(tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "");
  }
  return fields;
}

/**
 * Mriežka: názvy kurtov v `tblRecintos` (atribút decCodRecinto), bunky v `tblCasillas`.
 * ID obrázka bunky = img + kód kurtu + HHMM, stav je v názve obrázka (libre / ocupado / no_disponible).
 */
export function parseTorrevieja(html: string, bookingUrl: string): Court[] {
  const names = new Map(
    [...html.matchAll(/<td decCodRecinto="(\d+)"[^>]*>\s*<span class="LABEL3">([^<]+)<\/span>/gi)].map((m) => [
      m[1],
      decodeEntities(m[2]).trim(),
    ]),
  );
  const courts = new Map<string, Court>();
  for (const [, code, hhmm, image] of html.matchAll(
    /uReservaCuadrante_img(\d+?)(\d{4})"[^>]*?\bsrc="[^"]*\/([\w-]+)\.\w+"/gi,
  )) {
    const rawName = names.get(code) ?? code;
    const number = rawName.match(/p[aá]del\s+(\d+)/i)?.[1];
    const id = number ?? rawName;
    let court = courts.get(id);
    if (!court) {
      court = { id, name: number ? `Pista ${number}` : rawName, slots: [] };
      courts.set(id, court);
    }
    const start = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
    court.slots.push({
      start,
      end: fromMinutes(toMinutes(start) + SLOT_MINUTES),
      status: STATUS_BY_IMAGE[image.toLowerCase()] ?? "na",
      bookingUrl,
    });
  }
  return [...courts.values()];
}
