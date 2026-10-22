import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseNovaPadel, type NovaHour, type NovaRoom } from "../lib/sources/novapadel.js";

// Výber skutočných záznamov z /appointment/hour/available pre Outdoor NovaPark (piatok 23. 10. 2026);
// posledný 18:30 záznam má upravené availableDays bez piatku, aby test pokryl aj túto vetvu.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/novapadel.json", import.meta.url), "utf8")) as {
  date: string;
  rooms: NovaRoom[];
  hours: NovaHour[];
};
const courts = parseNovaPadel(fixture.rooms, fixture.hours, fixture.date);
const slot = (name: string, start: string) => courts.find((c) => c.name === name)?.slots.find((s) => s.start === start);

test("kurty sú zoradené podľa čísla", () => {
  assert.deepEqual(
    courts.map((c) => c.name),
    ["Pista 1", "Pista 2", "Pista 3"],
  );
});

test("mapuje voľné a obsadené sloty s cenou", () => {
  assert.deepEqual(slot("Pista 2", "08:00"), { start: "08:00", end: "09:30", status: "free", price: 9 });
  assert.equal(slot("Pista 3", "08:00")?.status, "busy");
  assert.equal(slot("Pista 3", "20:00")?.price, 15);
  assert.equal(slot("Pista 2", "15:30")?.status, "free");
});

test("vynechá neviditeľné sloty", () => {
  assert.equal(slot("Pista 3", "09:30"), undefined);
});

test("slot, ktorý sa v daný deň neponúka, je nedostupný", () => {
  assert.equal(slot("Pista 2", "18:30")?.status, "na");
});

test("sloty v rámci kurtu sú zoradené podľa času", () => {
  const starts = courts.find((c) => c.name === "Pista 2")!.slots.map((s) => s.start);
  assert.deepEqual(starts, [...starts].sort());
});
