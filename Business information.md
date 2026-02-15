# Business Information: Calvora (Studio)

Laatst geverifieerd: 14 februari 2026 (op basis van huidige codebase + screenshots in `pictures/live-picture-view-app`).

## 1. Doel en positionering

### Productdoel
Calvora is een webapp voor Nederlandse timmerbedrijven en aannemers om het volledige commerciële traject te beheren:

1. klantgegevens vastleggen,
2. calculatie/offerte opbouwen per klus,
3. materiaalkeuzes en metingen verwerken,
4. offertes omzetten naar facturen,
5. planning en winstmonitoring bijhouden,
6. administratieve randzaken (notities, archief, instellingen, support) afhandelen.

### Kernkenmerken in de huidige app
- Volledig Nederlandstalige UI voor de operationele kern.
- Focus op calculatie per klussoort met wizard-flow.
- Realtime data-opslag in Firestore, plus materiaalcatalogus in Supabase.
- PDF- en e-mailflow voor offertes/facturen en materiaallijsten.
- Navigatie en schermstructuur afgestemd op dagelijkse werkvolgorde (offerte -> uitvoering -> factuur -> cashflow).

### Doelgroep (operationeel)
- ZZP’ers en kleine bouw/timmerbedrijven.
- Gebruikers die werken met terugkerende calculatiesoorten (wanden, plafonds, vloeren, dak, kozijn, afwerking, etc.).
- Bedrijven die snelheid willen in offerteproductie, maar ook grip op marge en openstaande facturen.

---

## 2. Hoofdstructuur van de app

## Navigatie (linker menu)
Gebaseerd op `src/components/AppNavigation.tsx`.

| Label | Route | Functie |
|---|---|---|
| Dashboard | `/dashboard` | Dagoverzicht (planning, offertes, facturen, mini-grafieken) |
| Offertes | `/offertes` | Offerte-lijst en startpunt calculaties |
| Facturen | `/facturen` | Factuur-lijst en statusbeheer |
| Winst | `/winst` | KPI’s, cashflow, forecast |
| Planning | `/planning` | Week/maand planning en scheduling |
| Producten | `/materialen` | Materialen- en prijsbeheer |
| Klanten | `/klanten` | Klantenbeheer (adresboek) |
| Urenregistratie | `/urenregistratie` | Lokale urenboekingen (vandaag/timer/corrigeren/overzicht) |
| Notities | `/notities` | Persoonlijke notities met klantkoppeling |
| Archief | `/archief` | Gearchiveerde offertes/facturen + herstel/verwijderen |
| Instellingen | `/instellingen` | Bedrijf, leveranciers, calculatie defaults, offerte/factuur-config, planningdefaults |

Extra vaste actie in menu:
- `Nieuwe calculatie maken` -> `/offertes/nieuw`.

## Support-paneel (onderzijde menu)
Gebaseerd op `src/components/SupportSidePanel.tsx`.

| Label | Route | Functie |
|---|---|---|
| Feedback | `/feedback` | Feedbackbericht naar support (Firestore + n8n webhook) |
| Prijs import aanvragen | `/prijs-import-aanvragen` | Formulier voor AI-prijsimportaanvragen |
| Nieuw | `/nieuw` | Overzicht met 20 “incoming features” (statisch) |

---

## 3. Route-overzicht (actieve pagina’s)

### Kernroutes
- `/dashboard`
- `/offertes`
- `/offertes/nieuw`
- `/offertes/[id]`
- `/offertes/[id]/klant`
- `/offertes/[id]/edit`
- `/offertes/[id]/overzicht`
- `/offertes/[id]/klus/nieuw`
- `/offertes/[id]/klus/nieuw/[category]`
- `/offertes/[id]/klus/[klusId]/[category]/[slug]/materialen`
- `/offertes/[id]/klus/[klusId]/[category]/[slug]`
- `/offertes/[id]/klus/[klusId]/bewerken`
- `/facturen`
- `/facturen/start`
- `/facturen/nieuw`
- `/facturen/[id]`
- `/winst`
- `/planning`
- `/materialen`
- `/klanten`
- `/urenregistratie`
- `/notities`
- `/archief`
- `/instellingen`
- `/feedback`
- `/prijs-import-aanvragen`
- `/nieuw`
- `/login`, `/register`

### Overige utility routes
- `/support`
- `/view/[id]`
- `/test`

---

## 4. End-to-end bedrijfsflow in de applicatie

1. Nieuwe offerte starten (`/offertes/nieuw` -> redirect naar `/offertes/{id}/klant`).
2. Klantinformatie invullen/overnemen uit adresboek.
3. Kiezen van kluscategorie en klus-type.
4. Materialen kiezen, werkpakket (preset) laden/bijwerken, ontbrekende prijzen oplossen.
5. Metingen invullen (indien klus configuratie met meetvelden).
6. Overzicht & extra kosten invullen (transport, winstmarge, bouwplaats, verzendkosten).
7. Offerte bekijken in offerte-workspace (`/offertes/{id}` tabs: materialen/overzicht/arbeid/tekeningen/pdf/notities).
8. Offerte versturen (mailto-flow met PDF-download) en status beheren.
9. Factuur aanmaken vanuit offerte (voorschot/eind), betalingen registreren, PDF/mail.
10. Winst- en cashflowmonitoring via Dashboard en Winst-pagina.
11. Afronden via archiveren in Archief.

---

## 5. Offerte & calculatieflow (diep, code-geverifieerd)

## 5.1 Wizard-stappen (6 stappen + progress)

### Stap 1: Klantinformatie
- Route: `/offertes/{id}/klant`
- Header progress: `10`
- Component: `NewQuoteForm`
- Functionaliteit:
  - nieuw invoeren of klant kiezen uit adresboek (clients-collectie),
  - auto-save op veldniveau,
  - opslaan naar `quotes/{id}.klantinformatie`,
  - bij submit door naar stap 2.

### Stap 2: Kies een klus
- Route: `/offertes/{id}/klus/nieuw`
- Header progress: `20`
- Functionaliteit:
  - zoek/filter op kluscategorie,
  - favorieten beheren in `users/{uid}.favoriteJobs`,
  - categorie met 1 subitem maakt direct klusrecord aan.

### Stap 3: Kies klus type
- Route: `/offertes/{id}/klus/nieuw/{category}`
- Header progress: `40`
- Functionaliteit:
  - subtypes binnen category kiezen,
  - favorieten per klus-type,
  - aanmaak `quotes/{id}.klussen.{klusId}.maatwerk.meta`.

### Stap 4: Materialen
- Route: `/offertes/{id}/klus/{klusId}/{category}/{slug}/materialen`
- Header progress: `60`
- Belangrijk gedrag:
  - werkpakket selecteren (`Nieuw` of opgeslagen preset),
  - materiaalgroepen + custom groepen,
  - nieuw materiaal toevoegen,
  - ontbrekende prijzen blokkeren doorgang totdat ingevuld/opgeslagen,
  - materiaallijst delen (kopiëren, mailto, PDF),
  - preset opslaan/overschrijven/verwijderen,
  - support voor “pending material” states.

### Stap 5: Metingen
- Route: `/offertes/{id}/klus/{klusId}/{category}/{slug}`
- Header progress: `80`
- Functionaliteit:
  - dynamische meetvelden vanuit `JOB_REGISTRY`/job config,
  - vormkeuze (rectangle/slope/gable/L/U), openingen, koof, vensterbank, dagkant,
  - visualisatie en opslag,
  - bij opslaan naar overzicht.

### Stap 6: Overzicht & Extra’s
- Route: `/offertes/{id}/overzicht`
- Header progress: `100`
- Functionaliteit:
  - klusvolledigheid check,
  - transportinstellingen,
  - winstmarge-instellingen,
  - bouwplaatskostenpakketten,
  - verzendkostenpakketten,
  - standaardwaarden naar gebruikersinstellingen wegschrijven,
  - readyness-check voordat workflow als compleet wordt gezien.

### Opmerking over stap 5
Sommige klustypes hebben geen metingen; flow kan dan effectief van materialen naar overzicht gaan.

## 5.2 Offerte-workspace (`/offertes/{id}`)

Tabs in de huidige UI:
- `Materialen`
- `Overzicht`
- `Arbeid`
- `Tekeningen`
- `PDF Preview`
- `Notities`

Belangrijk gedrag:
- Leest calculatiedata (Supabase data_json) + quote-headerdata uit Firestore.
- Materiaalpreset per gebruiker/offerte.
- PDF-generatie met verborgen drawing-capture flow.
- SendQuoteModal: mailto-flow met gegenereerde body en PDF-download.
- Voorschotinstellingen per offerte (`facturatie.voorschotIngeschakeld`, `voorschotPercentage`).
- Optionele vergelijking huidige + 2 andere offertes op materiaalniveau (dev-functionaliteit in page).

---

## 6. Module-overzicht per hoofdscherm

## Dashboard (`/dashboard`)
Bron: `src/app/dashboard/page.tsx`.

- Data bronnen:
  - `quotes` (userId filter)
  - `invoices` (userId filter)
  - `planning_entries` (userId filter)
  - `invoices/{id}/payments` subcollecties
- Blokken:
  - Planning vandaag/morgen,
  - Projecten/Offertes statusoverzicht,
  - Facturenstatus incl. “te laat”.
- Grafieken:
  - geaccepteerde offertes per maand (6 maanden),
  - mini winstrapport (forecast),
  - ontvangen betalingen.

## Offertes lijst (`/offertes`)
- Realtime lijst met zoeken/filteren.
- Filtersets: Alle, Concept, Verzonden.
- Archiveren per offerte (`archived=true`).
- Nieuwe offerte-dialog met keuzes: zonder klant / met bestaande klant / nieuwe klant.
- Sync-achtige fallback voor totaalbedragen uit Supabase `quotes_collection.data_json`.

## Facturen lijst (`/facturen`)
- Realtime lijst niet-gearchiveerde facturen.
- Filters: Alle, Openstaand, Betaald.
- Acties: markeer betaald, openen, archiveren.
- Nieuwe factuur via quote-selectie.

## Factuur start (`/facturen/start`)
- Selecteer offerte voor facturatie.
- Knoppen per regel: voorschot of eindfactuur.

## Nieuwe factuur (`/facturen/nieuw`)
- Typekeuze: voorschot/eind.
- Voorschotpercentage, voorschotaftrek, eindbedragberekening.
- Hergebruik bestaande voorschotfactuur indien aanwezig.
- Aanmaak via `createInvoiceFromQuote`.

## Factuur detail (`/facturen/{id}`)
- Tabs: PDF / Overzicht / Betalingen.
- Statusacties: verzonden, betaald.
- Betalingen toevoegen (`payments` subcollectie) + payment summary update.
- Bedrag override voor eindfactuur.
- Verstuurflow via `SendInvoiceModal` (mailto + PDF download).

## Winst (`/winst`)
- Periodeknoppen: 1m / 3m / 6m / 12m.
- KPI’s: geprognotiseerde winst, ontvangen betalingen, openstaand, te-laat-risico, cash-in ratio.
- Visualisaties + toplijsten.
- Exportmogelijkheden (CSV/PDF report).

## Planning (`/planning`)
- Weergaven week/maand.
- Planregels en schedule-mode via query params.
- Instellingen: werkuren, werktijden, werkdagen, pauze, auto-split.
- Gebruikt o.a. `planning_entries` + `users/{uid}.settings.planningSettings`.

## Producten / Materialen (`/materialen`)
- Ophaal via `/api/materialen/get` met Bearer token.
- Zoeken/filter/sort/paginering.
- Nieuw materiaal met typekeuze:
  - `Calculatie Product` (met dimensies)
  - `Los Artikel` (zonder dimensies)
- Opslaan via `/api/materialen/upsert`.
- Verwijderen via `/api/materialen/delete`.
- Shortcut naar `/prijs-import-aanvragen`.

## Klanten (`/klanten`)
- CRUD op `clients` (user-gebonden).
- Zoek op naam/email/plaats.
- Edit/create modal met factuuradres + projectadres.
- Soort klant: Zakelijk/Particulier afgeleid van bedrijfsnaam.

## Urenregistratie (`/urenregistratie`)
- Tabs: Vandaag / Timer / Corrigeren / Overzicht.
- Projectselectie uit offertes.
- Snelle uren, custom uren, periodeboekingen.
- Timer met pauze en afrondregels.
- Correctiemodus met start/eindtijd + pauze.
- Belangrijk: opslag in `localStorage` (niet in Firestore).

## Notities (`/notities`)
- Persoonlijke notities in `notes`.
- Koppeling aan klant (optioneel).
- Filter op klantscope (alle/zonder/specifiek).
- Tagset: Let op, Aanname, Klant zegt, Later checken, Prijsgevoelig, Beslis nog.
- CRUD met editmodus en deleteconfirmatie.

## Archief (`/archief`)
- Tabs: Facturen / Offertes (query param `tab`).
- Toont alleen `archived=true` records.
- Herstelactie zet `archived=false` en verwijdert archive fields.
- “Verwijder alles” doet batch delete (per tab, permanent).

## Instellingen (`/instellingen`)
Tabs:
- Bedrijfsgegevens
- Leveranciers
- Calculatie-instellingen
- Offerte Config
- Bouwplaats
- Planning

Belangrijk gedrag:
- Merge van defaults + business profile + saved user settings.
- Logo en handtekening upload met autosave.
- Leveranciersbeheer voor materiaallijst-mailflow.
- Standaard marge/transport/uurtarief.
- Offerte/factuur nummering en standaardteksten.
- Bouwplaatskostenpakketten CRUD.
- Planning defaults (uren, tijden, werkdagen, auto-split).
- Medewerkerbeheer code aanwezig maar momenteel verborgen (`showEmployeesInSettings = false`).

## Feedback (`/feedback`)
- Form post naar `/api/support/feedback`.
- API:
  - tokenvalidatie,
  - schrijft `support_feedback` record,
  - verstuurt webhook naar n8n/Telegram,
  - slaat n8n status terug op.

## Prijs import aanvragen (`/prijs-import-aanvragen`)
- Form schrijft naar `price_import_requests`.
- Verplichte velden + URL-validatie + contactkeuze (telefoon/e-mail).
- Verplichte AI/public-source toestemming via 2 checkboxes.

## Nieuw (`/nieuw`)
- Statische pagina met 20 potentiële features en statuslabels:
  - In onderzoek
  - Roadmap kandidaat
  - Klaar voor planning

---

## 7. Screenshot-gedreven documentatie

Alle screenshot-assets staan onder:
- `pictures/live-picture-view-app`
- `pictures/live-picture-view-app/calculatie-6-stappen`

## 7.1 Hoofdschermen (menu-items)

| Scherm | Screenshot |
|---|---|
| Dashboard | `pictures/live-picture-view-app/Dashboard.png` |
| Offertes | `pictures/live-picture-view-app/Offertes.png` |
| Facturen | `pictures/live-picture-view-app/Facturen.png` |
| Winst | `pictures/live-picture-view-app/Winst.png` |
| Planning | `pictures/live-picture-view-app/Planning.png` |
| Producten | `pictures/live-picture-view-app/Producten.png` |
| Klanten | `pictures/live-picture-view-app/Klanten.png` |
| Urenregistratie | `pictures/live-picture-view-app/Urenregistratie.png` |
| Notities | `pictures/live-picture-view-app/Notities.png` |
| Archief | `pictures/live-picture-view-app/Archief.png` |
| Instellingen | `pictures/live-picture-view-app/Instellingen.png` |

## 7.2 Support-schermen

| Scherm | Screenshot |
|---|---|
| Feedback | `pictures/live-picture-view-app/Feedback.png` |
| Prijs import aanvragen | `pictures/live-picture-view-app/Prijs import aanvragen.png` |
| Nieuw | `pictures/live-picture-view-app/Nieuw.png` |

## 7.3 Calculatie 6-stappen workflow

| Stap | Screenshot |
|---|---|
| Stap 1 - Klantinformatie | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 1 - Klantinformatie.png` |
| Stap 2 - Kies een klus | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 2 - Kies een klus.png` |
| Stap 3 - Kies klus type (wanden) | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 3 - Kies klus type (wanden).png` |
| Stap 4 - Materialen | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 4 - Materialen.png` |
| Stap 5 - Metingen | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 5 - Metingen.png` |
| Stap 6 - Overzicht en extras | `pictures/live-picture-view-app/calculatie-6-stappen/Stap 6 - Overzicht en extras.png` |

## 7.4 Extra calculatie-states (modals/detail)

| State | Screenshot |
|---|---|
| Werkpakket kiezer | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 1 - Werkpakket kiezer.png` |
| Materiaal selector | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 2 - Materiaal selector.png` |
| Nieuw materiaal modal | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 3 - Nieuw materiaal modal.png` |
| Materiaallijst delen (boven) | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 4 - Materiaallijst delen (boven).png` |
| Materiaallijst delen (onder) | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 5 - Materiaallijst delen (onder).png` |
| Metingen detail | `pictures/live-picture-view-app/calculatie-6-stappen/Extra 6 - Metingen detail.png` |

## 7.5 Offerte-workspace extra beelden

| Onderdeel | Screenshot |
|---|---|
| Offerte - Materialen | `pictures/live-picture-view-app/offerte-materialen.png` |
| Offerte - Overzicht | `pictures/live-picture-view-app/offerte-overzicht.png` |
| Offerte - Arbeid | `pictures/live-picture-view-app/offerte-arbeid.png` |
| Offerte - Tekening | `pictures/live-picture-view-app/offerte-tekening.png` |
| Offerte - PDF preview | `pictures/live-picture-view-app/offerte-pdfpreview.png` |
| Offerte - Mail versturen | `pictures/live-picture-view-app/offerte-mailversturen.png` |

---

## 8. Data-architectuur

## 8.1 Firestore (primair)

| Collectie | Gebruik |
|---|---|
| `quotes` | Offertes inclusief `klantinformatie`, `klussen`, `extras`, status, totalen, facturatie-instellingen |
| `invoices` | Facturen inclusief snapshot van quote, status, totals, paymentSummary, archiefvelden |
| `invoices/{invoiceId}/payments` | Betalingsregels per factuur |
| `clients` | Adresboek |
| `users` | Gebruikersinstellingen + defaults + leverancierlijsten + planningdefaults |
| `businesses` | Bedrijfsprofieldata (prefill voor instellingen) |
| `notes` | Persoonlijke notities |
| `planning_entries` | Planning-items voor planning en dashboard |
| `support_feedback` | Feedback submissions + n8n status |
| `price_import_requests` | Prijsimport-aanvragen |

### Quotestructuur (vereenvoudigd)
- `quotes/{id}`
  - `userId`
  - `offerteNummer`
  - `klantinformatie`
  - `klussen.{klusId}`
    - `maatwerk.meta` (titel/type/slug)
    - `materialen` (o.a. `materialen_lijst`, `custommateriaal`, presets)
    - metingen/visualisatie/notities
  - `extras`
    - `transport`
    - `winstMarge`
    - `materieel` (bouwplaats)
    - `verzendkosten`
  - `status`
  - `archived` (+ metadata)

### Factuurstructuur (vereenvoudigd)
- `invoices/{id}`
  - `invoiceType` (`voorschot`/`eind`)
  - `invoiceNumberLabel`
  - `status`
  - `totalsSnapshot`
  - `paymentSummary`
  - `sourceQuote` snapshot
  - `financialAdjustments`
  - `archived` (+ metadata)

## 8.2 Supabase (materialen en calculatie data)

- `main_material_list`
  - gecombineerde fetch van user-specifieke + gedeelde regels,
  - canonical prijs in app: `prijs_excl_btw`.
- `quotes_collection` (gebruikt als bron voor `data_json` sync in offerteflow).

---

## 9. Statusmodel

## Offertestatussen
Volgens `src/lib/types.ts`:
- `concept`
- `in_behandeling`
- `verzonden`
- `geaccepteerd`
- `afgewezen`
- `verlopen`

## Factuurstatussen
Volgens `src/lib/types.ts`:
- `concept`
- `verzonden`
- `gedeeltelijk_betaald`
- `betaald`
- `geannuleerd`

Overige operationele statusvelden:
- `archived` (quotes/invoices)
- `n8nStatus` op feedback (`pending`, `sent`, `failed`)
- `status: 'nieuw'` op price import requests.

---

## 10. API-landschap (App Router)

| Route | Functie |
|---|---|
| `/api/env-check` | Omgevingsvalidatie |
| `/api/generate-email` | AI e-mailtekst via n8n webhook |
| `/api/logo-to-base64` | Logo naar base64 |
| `/api/visualisatie-to-base64` | Visualisatie naar base64 |
| `/api/offerte/generate` | Offerte/PDF-gerelateerde backendactie |
| `/api/quotes/ensure-data-json` | Borgt aanwezigheid data_json |
| `/api/quotes/update-data-json` | Schrijft data_json updates |
| `/api/materialen/get` | Materialen ophalen (Supabase, auth required) |
| `/api/materialen/upsert` | Materiaal aanmaken/updaten |
| `/api/materialen/upsert-small` | Kleinere/material-scope upsert |
| `/api/materialen/delete` | Materiaal verwijderen |
| `/api/materialen/custom` | Custom materiaaloperaties |
| `/api/materialen/update-price` | Prijsupdates |
| `/api/support/feedback` | Feedback opslaan + n8n webhook |

Authenticatiepatroon:
- Bearer token validatie op routes waar user-data wordt gelezen/geschreven.

---

## 11. Integraties

- Firebase Auth: sessie en user claims.
- Firestore: primaire appdata.
- Firebase Storage: o.a. assets zoals visualisaties/logos.
- Firebase Admin SDK (server routes): token verify en server writes.
- Supabase: materiaalcatalogus.
- n8n:
  - AI email generation,
  - feedback webhook (o.a. Telegram doorsturing),
  - overige webhookgestuurde flows via env-config.

---

## 12. Persistency & UX-details

- `Urenregistratie` gebruikt localStorage keys:
  - `urenregistratie_settings`
  - `urenregistratie_history`
  - `urenregistratie_active_timer`
- Navigatiemenu open/dicht onthouden via localStorage:
  - `app_navigation_open`
- WizardHeader toont status van klusonderdelen (materialen/metingen) in zijmenu.

---

## 13. Operationele aandachtspunten

1. Archief “Verwijder alles” is permanent (batch delete).
2. Urenregistratie is momenteel client-side (geen Firestore write), dus device/browser-afhankelijk.
3. `Nieuw`-pagina is informatief/statisch (geen backend workflow).
4. Medewerkersbeheer in Instellingen staat in code maar is uitgeschakeld in UI.
5. Materialenstap kan navigatie blokkeren tot ontbrekende prijsinformatie is opgelost/opgeslagen.

---

## 14. Technische stack (actueel project)

- Next.js `14.2.35` (App Router)
- TypeScript `5.4.5`
- Tailwind CSS + shadcn/ui (Radix)
- Firebase (Auth + Firestore + Admin + Storage)
- Supabase (materialenbeheer)
- jsPDF/html2canvas (PDF flows)
- Recharts (grafieken)

Belangrijkste scripts:
- `npm run dev` (poort 9003)
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run sync` / `python3 sync.py`

---

## 15. Samenvatting

De huidige app is niet alleen een offerteformulier maar een complete operationele keten voor calculatie, offertebeheer, facturatie en winststuring. De documentatie hierboven is afgestemd op:

- daadwerkelijke routes en componenten in de code,
- echte statusvelden en datastore-structuur,
- plus concrete schermvalidatie met de aanwezige screenshots in `pictures/live-picture-view-app`.
