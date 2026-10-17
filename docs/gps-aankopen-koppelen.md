# Aankopen koppelen en categoriseren

Nieuwe bonnen gebruiken de route **klant → leverancier**, of in de ochtend **leverancier → eerste klant**, als aanvullende koppeling wanneer een offerte-/handmatige referentie ontbreekt. Alleen materiaalregels krijgen de offerte. Gereedschap houdt de bestaande controle en blijft ongekoppeld aan één klus.

Voorwaarden:
- Alleen de eigenaar in `CALVORA_USER_ID` gebruikt het geconfigureerde Traccar-apparaat.
- Een aankoopbon met expliciete datum; geen maand-/verzamelfactuur, online bestelling, creditnota of bezorging.
- De vorige gemeten stop (of eerste volgende klantstop bij de ochtendroute) is minimaal 8 minuten bij precies één klantlocatie met precies één geaccepteerde/in-uitvoering/afgeronde offerte.
- Leverancier en filiaal passen bij de bon, de winkelstop duurt minimaal 5 minuten en volgt binnen 90 minuten. Geen GPS-gaten van meer dan 20 minuten op het relevante traject.
- Als meerdere winkelbezoeken op de bondatum passen, moeten ze allemaal dezelfde klant bewijzen.
- Bestaande koppelingen en zichtbare referentiekandidaten worden nooit aangevuld of vervangen door een GPS-gok.

`/api/kosten/create` vult nieuwe materiaalregels aan. De importwachtrij bewaart het bewijs zonder afgewezen imports opnieuw te activeren. Na automatische/manuele GPS-werkdagverwerking worden reeds opgeslagen, ongekoppelde materiaalbonnen opnieuw gecontroleerd. Dit loopt bij verwerking/import, niet als permanente live-locatiewatcher.

Bewijs: `project_costs.line_items[].gps_link_evidence` met klantadres, stopmomenten, leverancier en offerte. De documentregels in Kosten tonen dit bewijs. Er zijn geen nieuwe databasekolommen nodig.

Historische controle: POST `/api/kosten/link-gps` met Firebase Bearer-token en `{ "from": "2026-10-01", "to": "2026-10-10", "dryRun": true }`. Maximaal 14 dagen. Alleen expliciet `dryRun: false` schrijft. Updates controleren eigenaar, bestaande koppeling en `updated_at`, zodat een gelijktijdige handmatige wijziging niet wordt overschreven. Afgewezen imports, bedragen, categorieën en bankboekingen worden niet gewijzigd.

Tests: `node --test scripts/gps-purchase-link.test.cjs` en `npm run typecheck`.

Controle 11 oktober 2026: alleen-lezen proef op bestaande ongekoppelde materiaalbonnen van 24 september t/m 10 oktober leverde 0 eenduidige matches en 0 fouten bij ophalen van dagen. Er zijn geen historische kosten aangepast. De code is lokaal toegevoegd; productie-import/n8n en deployment zijn hiermee niet live geverifieerd.

## Aanpassing op persoonlijke werkwijze, 11 oktober 2026

De gebruiker koopt per klus apart en houdt geen voorraad. Daarom is ook de ochtendroute winkel → eerste klant toegestaan (voor 12:00, geen eerder klantbezoek). De leverancier moet op dezelfde bondatum passen. Een expliciet afwijkend afleveradres gaat vóór GPS. Postcode en plaats mogen alleen zelfstandig koppelen als één actieve offerte past; aanwezige straat/huisnummer/toevoeging moeten eveneens overeenkomen. Bestaande afwijkende handmatige koppelingen blijven behouden.

De extra aankoopfilialen Alkmaar, Alphen en Amsterdam Amstel zijn gecontroleerd via https://www.bouwmaat.nl/pages/klantenservice en geocodering; zij veranderen de urenberekening niet.

Productindeling gebruikt vaste productregels, een onafhankelijke tweede documentlezing en eerdere handmatige categoriecorrecties op exact dezelfde productomschrijving. Correcties staan in Firestore `users/{uid}/product_category_rules`. Bij onzekere producten blijft controle nodig; dit is geen claim van een bewezen nauwkeurigheidspercentage. Expliciete nulregels en creditbedragen blijven behouden. Een onverklaard verschil tussen regels en bonbedrag opent controle in plaats van automatische foto-opslag.

GPS-melding: tijdens gebruik van de app elke twee minuten een statuscontrole. Na 20 minuten zonder GPS-fix verschijnt een blijvende melding; bij onbereikbare controle staat expliciet dat de status onbekend is. Herstel laat de melding verdwijnen. Geen OS-popup. Deze controle draait niet als de app gesloten is en is geen achtergrondpushdienst.

Live bronproef, alleen lezen: de screenshot van betalingsopdracht 92848 tweemaal met de bestaande AI-configuratie uitgelezen. De tweede lezing vond Bisschopsweg 68, 3817BW Amersfoort; acht productregels, waaronder grootgoedbezorging met 100% korting en €0. Totaal €1.116,65 excl. en €1.351,15 incl. Geen financiële productiedata aangepast. Productie-deployment en echte importketen blijven afzonderlijk te verifiëren.
