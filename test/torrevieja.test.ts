import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hiddenFields, parseTorrevieja } from "../lib/sources/torrevieja.js";

// Výrez skutočnej mriežky „Pádel tardes“ na 23. 10. 2026
const html = readFileSync(new URL("./fixtures/torrevieja-tarde.html", import.meta.url), "utf8");
const URL_TARDE = "https://example.test/tarde";

test("parsuje 7 kurtov s 30-minútovými bunkami od 16:00 do 22:00", () => {
  const courts = parseTorrevieja(html, URL_TARDE);
  assert.deepEqual(
    courts.map((c) => c.name),
    ["Pista 1", "Pista 2", "Pista 3", "Pista 4", "Pista 5", "Pista 6", "Pista 7"],
  );
  for (const court of courts) {
    assert.equal(court.slots.length, 12);
    assert.equal(court.slots[0].start, "16:00");
    assert.equal(court.slots[0].end, "16:30");
    assert.equal(court.slots.at(-1)?.end, "22:00");
    assert.ok(court.slots.every((s) => s.bookingUrl === URL_TARDE));
  }
});

test("stav bunky berie z obrázka", () => {
  const courts = parseTorrevieja(html, URL_TARDE);
  const status = (n: number, start: string) => courts[n - 1].slots.find((s) => s.start === start)?.status;
  assert.equal(status(2, "16:00"), "free");
  assert.equal(status(2, "17:00"), "busy");
  assert.equal(status(4, "21:30"), "free");
  assert.equal(status(6, "18:30"), "free");
  assert.ok(courts[0].slots.every((s) => s.status === "na"), "Pista 1 je celá nedostupná");
});

test("hiddenFields dekóduje entity a ignoruje iné inputy", () => {
  const fields = hiddenFields(
    '<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="a&amp;b=" />' +
      '<input type="text" name="q" value="x" />' +
      '<input name="__EVENTVALIDATION" type="hidden" value="zz" />',
  );
  assert.deepEqual(fields, { __VIEWSTATE: "a&b=", __EVENTVALIDATION: "zz" });
});
