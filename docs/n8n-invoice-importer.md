# n8n factuurimport naar Kosten

Dit project bevat een importeerbare workflow in `n8n/offertehulp-invoice-importer.workflow.json`.

## Wat de workflow doet

1. Pollt beide Gmail-inboxen iedere vijf minuten op ongelezen e-mails met bijlagen.
2. Accepteert PDF- en afbeeldingsbijlagen uit `facturenvroegoptimmerwerken@gmail.com`.
3. Zoekt in `vroegoptimmerwerken@gmail.com` naar factuur-signalen in onderwerp, berichttekst en bestandsnaam.
4. Stuurt de bijlage naar `/api/kosten/extract`. De bestaande app slaat het document op in Supabase Storage en extraheert leverancier, datum, BTW, regels en offerte-referentie.
5. Als `offerte_id` gevonden is, of als de factuur geen materiaal bevat, stuurt hij de extractie door naar `/api/kosten/create` en maakt daarmee een regel in `project_costs` / de Kosten-tab.
6. Als `offerte_id` ontbreekt én er wel materiaalregels zijn, stuurt hij de extractie naar `/api/kosten/pending`. De factuur wordt dan niet als Kosten opgeslagen; de app opent bij het starten de bestaande `Nieuwe kost`-pagina met de factuur al ingevuld, zodat je de juiste offerte/klant kiest.
7. Een verwerkte e-mail krijgt `Facturen/Verwerkt`. Een wachtende e-mail krijgt `Facturen/Wacht op offerte`. Beide worden daarna als gelezen gemarkeerd, zodat dezelfde factuur niet opnieuw wordt geïmporteerd.

## Eenmalige voorbereiding

1. Controleer dat de productie-app `OPENAI_API_KEY` als Firebase App Hosting secret heeft. `/api/kosten/extract` gebruikt deze server-side.
2. Maak in beide Gmail-accounts de labels `Facturen/Verwerkt` en `Facturen/Wacht op offerte` aan.
3. Maak in n8n twee aparte Gmail OAuth2 credentials aan:
   - `Gmail - facturenvroegoptimmerwerken`
   - `Gmail - vroegoptimmerwerken`
4. Importeer de JSON-workflow.
5. Koppel de dedicated credential aan de nodes met `dedicated inbox` in de naam. Koppel de normale credential aan de nodes met `normale inbox finder` in de naam.
6. Vervang in alle HTTP Request-nodes:
   - `PASTE_FIREBASE_UID` door de Firebase UID van het Calvora-account.
   - `PASTE_N8N_HEADER_SECRET` door exact dezelfde waarde als `N8N_HEADER_SECRET` in App Hosting.
7. Controleer in de Gmail-actienodes dat beide labels bestaan en selecteer ze zo nodig opnieuw uit de dropdown.
8. Test eerst met één factuur mét offerte-referentie. Controleer daarna `/kosten` en de opgeslagen bon/factuur bij de kostenregel.
9. Test daarna met één factuur zonder referentie. Controleer dat er géén Kosten-regel verschijnt, maar dat bij het openen van de app het venster `Factuur koppelen aan een offerte` verschijnt.
10. Activeer de workflow pas nadat beide tests succesvol zijn.

## Belangrijke n8n-instellingen

De Gmail Trigger staat op `simple: false` en `downloadAttachments: true`; daardoor blijven de volledige berichttekst en de binaire bijlage beschikbaar voor de Code-node en de HTTP Request-node.

De normale inbox gebruikt bewust een bredere zoekopdracht. De Code-node filtert daarna op termen zoals `factuur`, `invoice`, `rekening`, `vervaldatum`, `btw` en `te betalen`, of op een factuurachtige bestandsnaam. Pas die lijst aan als leveranciers andere termen gebruiken.

De workflow verwerkt per e-mail de eerste PDF/afbeelding. Als leveranciers meerdere facturen in één e-mail sturen, moet de Code-node later worden uitgebreid met een aparte item-per-bijlage route.

## Endpoint-contract

De workflow gebruikt deze serverroutes:

- `POST /api/kosten/extract` als multipart form-data met `file` en `user_id`.
- `POST /api/kosten/create` als JSON met de `data` uit de extractie plus `user_id`.
- `POST /api/kosten/pending` als JSON met `user_id` en de geëxtraheerde `payload` wanneer geen `offerte_id` gevonden is.

De app haalt openstaande imports op via `GET /api/kosten/pending`. Na het kiezen van een offerte maakt `POST /api/kosten/create` de Kosten-regel aan met `pending_import_id` en markeert de import als gekoppeld.

De n8n-header `x-offertehulp-secret` wordt door beide routes gecontroleerd. Deel deze waarde niet in een publieke workflow of screenshot.
