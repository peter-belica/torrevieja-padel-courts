export const USER_AGENT =
  "Mozilla/5.0 (compatible; torrevieja-padel-courts/0.1; +https://github.com/peter-belica/torrevieja-padel-courts)";

const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

export interface Page {
  url: string;
  status: number;
  text: string;
}

/**
 * Minimalistický prehliadač: drží cookies jedného webu a sám rieši presmerovania,
 * aby sa nestratili cookies nastavené v odpovedi 302 (fetch by ich pri redirect: "follow" zahodil).
 */
export class Session {
  private cookies = new Map<string, string>();

  get(url: string): Promise<Page> {
    return this.request(url, "GET");
  }

  post(url: string, form: URLSearchParams): Promise<Page> {
    return this.request(url, "POST", form);
  }

  private async request(url: string, method: string, body?: URLSearchParams): Promise<Page> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = { "user-agent": USER_AGENT, "accept-language": "es,en;q=0.8" };
      if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      if (body) headers["content-type"] = "application/x-www-form-urlencoded";

      const res = await fetch(current, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      for (const cookie of res.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0];
        const eq = pair.indexOf("=");
        if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = new URL(location, current).toString();
        if (res.status !== 307 && res.status !== 308) {
          method = "GET";
          body = undefined;
        }
        continue;
      }
      return { url: current, status: res.status, text: await res.text() };
    }
    throw new Error(`Príliš veľa presmerovaní: ${url}`);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return match;
  });
}
