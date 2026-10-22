import { Session } from "../http.js";
import { courtsLabel, fromMinutes, slotMinutes, toMinutes } from "../time.js";
import { SourceError, type Calendar, type Court, type SlotStatus } from "../types.js";

const BASE = "https://deportes.orihuela.es";
const ACTIVITY_PADEL = "010";
const COMPLEX_CDM_PLAYAS = "015";
const BOOKING_URL = `${BASE}/alqInst.php?alq=1&complejo=${COMPLEX_CDM_PLAYAS}&tipinsta=${ACTIVITY_PADEL}&cas=1`;
const DEFAULT_SLOT_MINUTES = 90;

/** CSS triedy buniek podľa legendy na deportes.orihuela.es */
const STATUS_BY_CLASS: Record<string, SlotStatus> = {
  fondoVerde: "free",
  fondoRojo: "busy",
  fondoRojoClaro: "busy",
  fondoNaranja: "busy", // práve niekto rezervuje
  fondoAzulTeal: "past",
  fondoVerdeOscuro: "na", // mimo rozsahu
  fondoGris: "na", // len pre súťaže
};

export async function fetchOrihuela(date: string): Promise<Calendar> {
  // Obsadenosť sa vydá aj anonymnej PHP session, stačí ju získať z úvodnej stránky.
  const session = new Session();
  await session.get(`${BASE}/index.php`);

  const [y, m, d] = date.split("-");
  const form = new URLSearchParams({
    act: ACTIVITY_PADEL,
    comp: COMPLEX_CDM_PLAYAS,
    dia: `${d}/${m}/${y}`,
    tipo: "1",
    numaut: "",
    apli: "",
    tipinst: "",
    dia2: "",
    d1: "1",
    d2: "1",
    d3: "1",
    d4: "1",
    d5: "1",
    d6: "1",
    d7: "1",
    instalacion: "todos",
  });
  const page = await session.post(`${BASE}/generainstalaciones.php`, form);
  if (page.status !== 200) throw new SourceError(`Orihuela: HTTP ${page.status}.`);
  if (/sesi[oó]n finalizada/i.test(page.text)) throw new SourceError("Orihuela: web odmietol reláciu.");

  const courts = parseOrihuela(page.text);
  return {
    source: "orihuela",
    title: "CDM Playas de Orihuela",
    subtitle: `Padel · ${courtsLabel(courts.length)} · sloty po ${slotMinutes(courts, DEFAULT_SLOT_MINUTES)} min`,
    date,
    slotMinutes: slotMinutes(courts, DEFAULT_SLOT_MINUTES),
    links: [{ label: "Rezervovať na deportes.orihuela.es", url: BOOKING_URL }],
    courts,
    note: courts.length ? undefined : "Na tento deň web Orihuela zatiaľ nič neponúka.",
    fetchedAt: new Date().toISOString(),
  };
}

/** Odpoveď generainstalaciones.php: jeden `row minihr` na kurt, bunky `talq` s časom začiatku. */
export function parseOrihuela(html: string): Court[] {
  return html
    .split('class="row minihr"')
    .slice(1)
    .map((row) => {
      const rawName = row.match(/col-md-2">([^<]+)/)?.[1]?.trim() ?? "?";
      const cells = [...row.matchAll(/<div class="([^"]*\btalq\b[^"]*)"[^>]*>(\d\d:\d\d)<\/div>/g)];
      const length = cells.length > 1 ? toMinutes(cells[1][2]) - toMinutes(cells[0][2]) : DEFAULT_SLOT_MINUTES;
      const number = rawName.match(/P[AÁ]DEL\s+(\d+)/i)?.[1];
      return {
        id: number ?? rawName,
        name: number ? `Pista ${number}` : rawName,
        slots: cells.map(([, classes, start]) => ({
          start,
          end: fromMinutes(toMinutes(start) + length),
          status: statusFromClasses(classes),
        })),
      };
    });
}

function statusFromClasses(classes: string): SlotStatus {
  for (const cls of classes.split(/\s+/)) {
    if (cls in STATUS_BY_CLASS) return STATUS_BY_CLASS[cls];
  }
  return "na";
}
