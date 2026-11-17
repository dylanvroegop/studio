# Offerte splitsen

Een splitsing verdeelt bestaande producten, uren, marge en transport over meerdere offertes. De eerste deelofferte behoudt het oorspronkelijke nummer. De overige delen krijgen nieuwe nummers en alle delen worden concepten.

## Oorzaak van de fout van 4 november 2026

De split-route wijzigde `status` en `data_json` samen in `quotes_collection`. Daardoor draaide `preserve_quote_input_on_calculation`: deze n8n-trigger vervangt alleen gewone materialen en bewaart juist uren, werkbeschrijving, instellingen en scopekosten. Het oorspronkelijke aantal uren bleef daardoor staan terwijl extra deeloffertes werden gemaakt. Daarnaast werd procentuele marge niet verdeeld en kon transport opnieuw per deel worden berekend.

De UI koppelde beschrijvingen bovendien op index aan calculatieklussen. Eén gezamenlijke beschrijving bij twee klussen werd zo weergegeven alsof die bij slechts één klus hoorde. Alle materialen stonden standaard toegewezen aan het eerste deel.

De AI-analyse had daarnaast een fout bij maatwerknotities: de validator verwachtte `notitieblokId:regelId`, terwijl het model alleen de losse IDs ontving. Het model krijgt nu per regel de volledige `key`. Het antwoordschema beperkt verwijzingen tot de daadwerkelijk aangeboden deeloffertes, klussen, materialen, notitieblokken en maatwerkregels. Dubbele regels binnen één deel en dubbele klustoewijzingen worden geweigerd; gedeelde materialen mogen over delen worden verdeeld zolang hun totale aantal of bedrag behouden blijft. Als een notitieblok of maatwerkregel aan meerdere delen wordt gekoppeld, blijft de bestaande bewerkbare toewijzing behouden met een expliciet controlepunt; de overige geldige voorstellen worden wel ingevuld. Regressietests bevatten notitieblokken met meerdere maatwerkregels en gelijke regel-IDs in verschillende blokken.

## Huidig gedrag

- Eén gedeelde planner controleert vooraf alle producten en klussen, de som van uren en marge en de resulterende bedragen.
- Materialen komen uit de opgeslagen bron; een meegezonden prijs wordt niet vertrouwd. Elke productregel moet volledig worden verdeeld: fysieke materialen in aantallen, klein materiaal (schatting) en handmatige materiaalcorrecties in euro’s excl. btw. De som per bronregel moet exact behouden blijven; prijzen per fysiek stuk worden niet aangepast. Bij verdeelde kostenposten worden `prijs_per_stuk` en het oudere `prijs_excl_btw` samen bijgewerkt, zodat normalisatie niet het oorspronkelijke volledige bedrag terugzet.
- Transport wordt in centen verdeeld op basis van uren. Procentuele marge wordt omgerekend naar vaste deelbedragen. De volledige prijs inclusief btw staat naast de titel van elk deel; het uitgebreide totaaloverzicht is verwijderd.
- Per deel wordt een echte bestaande werkbeschrijving gekozen of een eigen beschrijving ingevuld. Er wordt geen inhoudelijke verdeling op basis van een index verondersteld.
- De bronversie wordt inhoudelijk gecontroleerd met gesorteerde objectvelden: een andere veldvolgorde uit Firestore/Supabase is geen wijziging. De volgorde van productregels blijft wel relevant. Na een geslaagd, server-gevalideerd AI-voorstel wordt de gecontroleerde bronversie vernieuwd; een echte wijziging tijdens de aanvraag blijft geblokkeerd. Bij een gewijzigd open voorstel noemt de melding welke broncategorie is gewijzigd en verwijst naar opnieuw analyseren.
- De bronversie wordt gecontroleerd. Lopende berekeningen, een vastgelegde prijsafspraak en gemengde arbeid-btw blokkeren splitsen met een concrete melding.
- Een unieke aanvraag-ID voorkomt dubbele kinderen bij opnieuw versturen.
- `quotes/{id}/split_operations/{requestId}` bevat vóór de mutaties de volledige bronofferte en calculatieregels, gevolgd door de voorgenomen calculaties.
- Supabase-wijzigingen raken uitsluitend `data_json`, met vergelijking van de eerdere inhoud. Firestore publiceert alle deeloffertes in één transactie.
- Bij een fout worden reeds gewijzigde calculaties teruggezet en ongepubliceerde kinderen opgeruimd. Nieuwere bewerkingen worden nooit blind teruggezet. Bij onvolledig herstel blijft `splitInProgress` staan en krijgt de operatie status `recovery_required`.
- De editor blokkeert saves uit een oude tab na splitsen. De offertepagina haalt bij een nieuwe splitversie de nieuwe calculatie op voordat zij totalen synchroniseert.
- Verdeelde scopekosten worden niet bij het openen van een deelofferte automatisch opnieuw berekend. Handmatig aanpassen blijft mogelijk.
- Met **AI-verdeling voorstellen** doet `gpt-6-astra` één gestructureerde aanvraag voor producttoewijzing, klusindeling, uren en klantklare beschrijvingen. De analyse schrijft niets naar de offerte. De gebruiker kan alle voorstellen controleren en aanpassen voordat de daadwerkelijke splitsing begint. Onzekerheden staan onder Controlepunten.
- Als de betreffende werkbeschrijvingopties aanstaan, worden de bestaande bedragen voor Afvalkosten en Naden schilderklaar automatisch naar netto m² verdeeld. Centen blijven behouden. Oppervlakte komt uit de toegewezen calculatieklussen (inclusief aantallen, openingen en twee plaatzijden), met een bewerkbare m²-invoer per deel. Ontbrekende maten blokkeren automatische verdeling totdat deze zijn ingevuld. Gedeelde materialen krijgen bewerkbare aantallen per deel (bijvoorbeeld 30 en 10 van 40 balken). AI gebruikt materiaalkeuzes, maten en hoeveelheden per klus en verdeelt klein materiaal over de relevante delen; onzekerheden blijven controlepunten. Invoer met een tekort of overschot blokkeert splitsen met de productnaam en het resterende aantal of bedrag.
- Uren worden op basis van AI-gewichten naar het bestaande urentotaal geschaald. De AI mag het urentotaal niet verhogen of verlagen. Een gewijzigde bron, ongeldige toewijzing of onvolledig AI-antwoord wordt geweigerd.
- Bij een mislukte AI-analyse blijft de reden direct onder de AI-knop staan, inclusief de verwerkingsstap en HTTP-status indien beschikbaar. De invoer blijft bewerkbaar. De melding onderaan gaat apart over wat nog ontbreekt voor de definitieve splitsing. Een fout mag niet alleen als tijdelijke notificatie achter het venster verschijnen.
- Elk deel bewaart de tekeningen van zijn eigen calculatieklussen. `splitIncludeDrawings` zorgt dat deze meegaan in de officiële PDF, ook als de vroegere PDF-optie uitstond. Afbeeldingen worden parallel geladen; een lopende, mislukte of onbereikbare tekening geeft een melding voordat een PDF wordt verstuurd.

Er is geen gezamenlijke transactie over Firestore en Supabase. Bij een processtop of niet herstelbare opslagfout moet de opgeslagen operatie worden bekeken. Vergelijk eerst de actuele gegevens met het opgeslagen plan; gebruik de herstelkopie nooit om latere bewerkingen blind te overschrijven. Na bevestigd volledig herstel krijgt de client `retryable: true` en maakt hij een nieuwe aanvraag-ID aan, met behoud van de ingevulde verdeling. Bij een verloren antwoord blijft dezelfde ID behouden, zodat opnieuw proberen geen dubbele offertes maakt.

Het splitvenster heeft een eigen scrollcontainer rond het formulier. Deze is begrensd met `min-height: 0` en `overscroll-behavior: contain`; het fieldset zelf is niet langer de scrollcontainer. Het modale venster houdt de achtergrond geblokkeerd.

## Controle

```sh
node --test scripts/quote-split-source.test.cjs scripts/quote-split.test.cjs scripts/quote-split-edit-guard.test.cjs scripts/quote-split-ai.test.cjs scripts/quote-split-analyze-route.test.cjs
npm install --prefix /tmp/studio-split-sql-test --no-package-lock --no-audit --no-fund @electric-sql/pglite
NODE_PATH=/tmp/studio-split-sql-test/node_modules node --test scripts/quote-split-sql.test.cjs scripts/calculation-input-preservation.test.cjs
npm run test:quote-scope-costs
npm run test:labor-vat
npm run typecheck
npm run build
```

De SQL-test reproduceert de fout met de echte trigger uit de migratie, en controleert daarna dat een update zonder `status` het volledige splitplan bewaart. Routetests gebruiken geïsoleerde opslagdubbels, inclusief mislukte commits, verloren antwoorden, gelijktijdige wijzigingen en herstel. Deze tests maken geen echte klantoffertes aan.

## Opslagfout en foutmeldingen (4 november, 16:39)

De oorspronkelijke compare-and-swap stuurde de volledige calculatie via `.eq('data_json', JSON.stringify(...))` mee in de URL. Bij deze offerte werd dat ongeveer 25 kB; de oude PATCH gaf `Bad Request` en een GET via Node liep vast op `UND_ERR_HEADERS_OVERFLOW`. Migratie `20261104_compare_and_swap_quote_calculation.sql` verplaatst de vergelijking naar een atomaire PostgreSQL-functie. De service-role RPC krijgt de verwachte en nieuwe JSON in de POST-body; alleen `data_json` wordt bijgewerkt. Ook compensatie gebruikt deze functie. De functie is niet uitvoerbaar door anon/authenticated. Pas de migratie toe voordat deze route wordt uitgerold.

De toast-viewport staat op z-index 200, boven dialogen (130). Een mislukte daadwerkelijke splitsing blijft bovendien als alert boven het formulier staan, met HTTP-status en de opslagstap. Invoer blijft behouden. Het operatieverslag bevat nu ook de stap waarin de fout optrad.
