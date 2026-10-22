import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseOrihuela } from "../lib/sources/orihuela.js";

// Skutočná odpoveď generainstalaciones.php pre padel v CDM Playas na 23. 10. 2026
const html = readFileSync(new URL("./fixtures/orihuela.html", import.meta.url), "utf8");

test("parsuje tri padelové kurty s 90-minútovými slotmi", () => {
  const courts = parseOrihuela(html);
  assert.deepEqual(
    courts.map((c) => c.name),
    ["Pista 1", "Pista 2", "Pista 3"],
  );
  for (const court of courts) {
    assert.equal(court.slots.length, 9);
    assert.deepEqual(court.slots[0], { start: "09:00", end: "10:30", status: court.slots[0].status });
    assert.equal(court.slots.at(-1)?.start, "21:00");
  }
});

test("rozlišuje voľné a obsadené sloty podľa CSS tried", () => {
  const [pista1, pista2] = parseOrihuela(html);
  const status = (court: typeof pista1, start: string) => court.slots.find((s) => s.start === start)?.status;
  assert.equal(status(pista1, "09:00"), "free");
  assert.equal(status(pista1, "10:30"), "free");
  assert.equal(status(pista1, "12:00"), "busy");
  assert.ok(pista2.slots.every((s) => s.status === "busy"));
});

test("prázdna odpoveď znamená žiadne kurty", () => {
  assert.deepEqual(parseOrihuela("<div></div>"), []);
});
