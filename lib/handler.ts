import { isAllowedDate, madridNow, markPast } from "./time.js";
import { SourceError, type Calendar } from "./types.js";

/** Vercel CDN drží odpoveď 5 min a ďalších 15 min ju vydáva, kým na pozadí sťahuje novú. */
const CACHE_OK = "public, s-maxage=300, stale-while-revalidate=900";

export function calendarHandler(load: (date: string) => Promise<Calendar>) {
  return async function GET(request: Request): Promise<Response> {
    const date = new URL(request.url).searchParams.get("date") ?? madridNow().date;
    if (!isAllowedDate(date)) {
      return json({ error: "Neplatný alebo príliš vzdialený dátum." }, 400);
    }
    try {
      const calendar = await load(date);
      markPast(calendar.courts, date);
      return json(calendar, 200, CACHE_OK);
    } catch (err) {
      console.error(err);
      const message = err instanceof SourceError ? err.message : "Zdroj je momentálne nedostupný.";
      return json({ error: message }, 502);
    }
  };
}

function json(body: unknown, status: number, cacheControl = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl },
  });
}
