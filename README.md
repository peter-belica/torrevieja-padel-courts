# Voľné padelové kurty

Jedna stránka, na ktorej vidno voľné padelové kurty z troch rezervačných systémov pod sebou.
Klik na voľné (zelené) okno otvorí oficiálnu rezerváciu, kde ju dokončíš sám.

| Kalendár | Web | Ako sa ťahajú dáta |
|---|---|---|
| CDM Playas de Orihuela | deportes.orihuela.es | anonymná PHP session → `POST generainstalaciones.php` → HTML |
| NovaPadel · Outdoor NovaPark | novapadel.es | prihlásenie účtom (len na serveri) → JSON API |
| Concejalía de Deportes Torrevieja | torreviejadeportes.i2a.es | „Acceso no identificado“ → 6 krokov ASP.NET WebForms → HTML (ráno + poobede) |

Návštevník stránky sa nikde neprihlasuje. Účet do NovaPadel je uložený iba v premenných prostredia na serveri.

## Architektúra

```
public/            statická stránka (index.html, app.js, styles.css)
api/<zdroj>.ts     Vercel funkcie: GET /api/orihuela|novapadel|torrevieja?date=YYYY-MM-DD
lib/sources/       adaptéry jednotlivých webov → spoločný model Calendar (lib/types.ts)
lib/handler.ts     validácia dátumu, označenie uplynulých slotov, CDN cache (5 min + 15 min stale)
lib/http.ts        Session: cookies + manuálne presmerovania
```

Každý kalendár sa načítava samostatne, takže pomalý alebo nedostupný web neblokuje ostatné.
Torrevieja je najpomalšia (~10–15 s pri prvom načítaní dňa), potom ju drží CDN cache.

## Lokálne

```bash
npm install
cp .env.example .env.local   # doplň NOVAPADEL_EMAIL a NOVAPADEL_PASSWORD
npm run dev                  # http://localhost:3000
npm test                     # testy parserov nad uloženými odpoveďami
npm run smoke -- 2026-10-23  # živý test všetkých zdrojov
```

## Nasadenie na Vercel

1. Účet na [vercel.com/signup](https://vercel.com/signup), plán **Hobby**.
2. **Add New → Project → Import** tohto GitHub repa. Framework Preset: **Other**, nič iné netreba meniť.
3. **Settings → Environment Variables:** `NOVAPADEL_EMAIL`, `NOVAPADEL_PASSWORD`. Potom **Redeploy**.

Funkcie bežia v regióne `cdg1` (Paríž), najbližšie k Španielsku (`vercel.json`).

## Keď sa niektorý web zmení

Adaptér vráti chybu a v jeho sekcii sa zobrazí hláška, ostatné kalendáre fungujú ďalej.
Postup opravy: `npm run smoke -- <zdroj>`, porovnať HTML/JSON s fixtures v `test/fixtures/` a upraviť parser.

- **NovaPadel:** po neúspešnom prihlásení sa 10 minút ďalej neskúša (web po 3 zlých pokusoch zapína captchu).
- **Torrevieja:** odkaz na rezerváciu v novom prehliadači najprv ukáže výber prístupu. Po ňom treba odkaz otvoriť znova.
