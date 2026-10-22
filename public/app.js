const SOURCES = [
  { id: "orihuela", title: "CDM Playas de Orihuela" },
  { id: "novapadel", title: "NovaPadel · Outdoor NovaPark" },
  { id: "torrevieja", title: "Concejalía de Deportes Torrevieja" },
];
const DAYS_AHEAD = 7;
const TIME_ZONE = "Europe/Madrid";
const WEEKDAYS = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const STATUS_LABEL = { free: "voľné", busy: "obsadené", na: "nedostupné", past: "uplynulo" };

const state = { date: "" };
const results = new Map();
let generation = 0;

const $dates = document.getElementById("dates");
const $calendars = document.getElementById("calendars");

// ---------- dátumy ----------

function madridToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date, index) {
  if (index === 0) return "Dnes";
  if (index === 1) return "Zajtra";
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

function availableDates() {
  const today = madridToday();
  return Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));
}

// ---------- stav a URL ----------

function loadState() {
  const requested = new URLSearchParams(location.search).get("date");
  const dates = availableDates();
  state.date = dates.includes(requested) ? requested : dates[0];
}

function saveState() {
  history.replaceState(null, "", `?${new URLSearchParams({ date: state.date })}`);
}

// ---------- ovládanie ----------

function renderDates() {
  $dates.replaceChildren(
    ...availableDates().map((date, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = dayLabel(date, i);
      button.setAttribute("aria-pressed", String(date === state.date));
      button.addEventListener("click", () => {
        if (state.date === date) return;
        state.date = date;
        saveState();
        renderDates();
        loadAll();
      });
      return button;
    }),
  );
}

// ---------- načítanie ----------

function loadAll() {
  const gen = ++generation;
  for (const source of SOURCES) loadSource(source, gen);
}

async function loadSource(source, gen) {
  results.set(source.id, { status: "loading" });
  renderSection(source);
  let result;
  try {
    const res = await fetch(`/api/${source.id}?date=${state.date}`);
    const body = await res.json().catch(() => ({}));
    result = res.ok ? { status: "ok", data: body } : { status: "error", error: body.error ?? `HTTP ${res.status}` };
  } catch {
    result = { status: "error", error: "Nepodarilo sa spojiť so serverom." };
  }
  if (gen !== generation) return;
  results.set(source.id, result);
  renderSection(source);
}

// ---------- vykreslenie ----------

function sectionElement(source) {
  let el = document.getElementById(`cal-${source.id}`);
  if (!el) {
    el = document.createElement("section");
    el.className = "cal";
    el.id = `cal-${source.id}`;
    el.setAttribute("aria-live", "polite");
    $calendars.append(el);
  }
  return el;
}

function renderSection(source) {
  const el = sectionElement(source);
  const result = results.get(source.id) ?? { status: "loading" };

  if (result.status === "loading") {
    el.innerHTML = `
      ${head(source.title, "Načítavam…", "")}
      <div class="cal-body">
        <p class="loading-text">Sťahujem obsadenosť z oficiálneho webu…</p>
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>`;
    return;
  }

  if (result.status === "error") {
    el.innerHTML = `
      ${head(source.title, "", "")}
      <div class="cal-body">
        <p class="message error">${esc(result.error)}<button type="button">Skúsiť znova</button></p>
      </div>`;
    el.querySelector("button").addEventListener("click", () => loadSource(source, generation));
    return;
  }

  const cal = result.data;
  const cols = columns(cal);
  const free = cal.courts.reduce((n, c) => n + c.slots.filter((s) => s.status === "free").length, 0);
  const badge = free
    ? `<span class="badge">${freeLabel(free)}</span>`
    : `<span class="badge none">nič voľné</span>`;

  const body = cols.length
    ? grid(cal, cols)
    : `<p class="message">${esc(cal.note ?? "Na tento deň nie sú dáta.")}</p>`;

  const updated = new Intl.DateTimeFormat("sk-SK", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(
    new Date(cal.fetchedAt),
  );
  const note = cal.courts.length && cal.note ? `<p class="note">${esc(cal.note)}</p>` : "";

  el.innerHTML = `
    ${head(cal.title, cal.subtitle, badge)}
    <div class="cal-body">${body}${note}</div>
    <div class="cal-foot">
      <span>Aktualizované ${updated}</span>
      <span class="links">${cal.links
        .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
        .join("")}</span>
    </div>`;
}

function head(title, subtitle, badge) {
  return `
    <header class="cal-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
      ${badge}
    </header>`;
}

function columns(cal) {
  return [...new Set(cal.courts.flatMap((c) => c.slots.map((s) => s.start)))].sort();
}

function grid(cal, cols) {
  const colWidth = cal.slotMinutes <= 30 ? 46 : 60;
  // Hrubšia čiara tam, kde medzi stĺpcami chýba čas (napr. obedná pauza v Torrevieji).
  const gapBefore = new Set(cols.filter((t, i) => i > 0 && toMinutes(t) - toMinutes(cols[i - 1]) > cal.slotMinutes));
  const gap = (t) => (gapBefore.has(t) ? " gap" : "");

  const headRow = cols.map((t) => `<th scope="col" class="${gap(t).trim()}">${t}</th>`).join("");
  const rows = cal.courts
    .map((court) => {
      const byStart = new Map(court.slots.map((s) => [s.start, s]));
      const cells = cols.map((t) => cell(cal, court, byStart.get(t), gap(t))).join("");
      return `<tr><th scope="row" class="court">${esc(court.name)}</th>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="scroll">
      <table class="grid" style="--col:${colWidth}px">
        <caption class="sr">${esc(cal.title)} – obsadenosť kurtov</caption>
        <thead><tr><th scope="col" class="court">Kurt</th>${headRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function cell(cal, court, slot, gapClass) {
  if (!slot) return `<td class="s-na${gapClass}"></td>`;
  const price = slot.price ? ` · ${formatPrice(slot.price)}` : "";
  const label = `${court.name}, ${slot.start}–${slot.end}, ${STATUS_LABEL[slot.status]}${price}`;
  if (slot.status === "free") {
    const href = slot.bookingUrl ?? cal.links[0]?.url ?? "#";
    const text = slot.price ? formatPrice(slot.price) : "voľné";
    return `<td class="s-free${gapClass}"><a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(label)}" aria-label="${esc(label)}">${text}</a></td>`;
  }
  return `<td class="s-${slot.status}${gapClass}" title="${esc(label)}"><span class="sr">${esc(STATUS_LABEL[slot.status])}</span></td>`;
}

// ---------- pomocné ----------

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatPrice(price) {
  return `${Number.isInteger(price) ? price : price.toFixed(2).replace(".", ",")} €`;
}

/** 1 voľné okno, 2–4 voľné okná, 5+ voľných okien */
function freeLabel(n) {
  if (n === 1) return "1 voľné okno";
  if (n <= 4) return `${n} voľné okná`;
  return `${n} voľných okien`;
}

function esc(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

// ---------- štart ----------

loadState();
saveState();
renderDates();
loadAll();
