// Živý test adaptérov proti skutočným webom: npm run smoke -- [orihuela|novapadel|torrevieja ...] [YYYY-MM-DD]
import { SOURCES } from "../lib/sources/index.js";
import { addDays, madridNow } from "../lib/time.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // bez .env.local sa NovaPadel nepripojí, ostatné zdroje fungujú
}

const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? addDays(madridNow().date, 1);
const names = args.filter((a) => a in SOURCES);
const selected = names.length ? names : Object.keys(SOURCES);

for (const name of selected) {
  const started = Date.now();
  try {
    const cal = await SOURCES[name as keyof typeof SOURCES](date);
    const free = cal.courts.reduce((n, c) => n + c.slots.filter((s) => s.status === "free").length, 0);
    console.log(`\n${cal.title} — ${date} — ${cal.courts.length} kurtov, ${free} voľných (${Date.now() - started} ms)`);
    for (const court of cal.courts) {
      const cells = court.slots.map((s) => `${s.start}${{ free: "✓", busy: "✗", na: "·", past: "–" }[s.status]}`);
      console.log(`  ${court.name.padEnd(10)} ${cells.join(" ")}`);
    }
    if (cal.note) console.log(`  (${cal.note})`);
  } catch (err) {
    console.log(`\n${name} — CHYBA (${Date.now() - started} ms): ${err instanceof Error ? err.message : err}`);
  }
}
