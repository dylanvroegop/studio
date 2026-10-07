# Onderzoek laadtijden — 25 september 2026

## Gevonden oorzaken en wijzigingen

| Onderdeel | Oorzaak | Aanpassing |
| --- | --- | --- |
| Offerte → Maak factuur | Instellingen, offerte, calculatie en voorschotcontrole werden achter elkaar uitgevoerd. Historische prijsvelden werden tijdens openen opgeslagen. | Onafhankelijke bronnen parallel laden; administratie pas bij daadwerkelijk aanmaken opslaan. De knop is een vooraf laadbare Next-link. Fouten bieden opnieuw laden. |
| Voorschotcontrole | De eerste 50 facturen werden opgehaald en lokaal gefilterd. Een ouder voorschot kon ontbreken. | Firestore-query op eigenaar, offerte en factuurtype. |
| Bestaande factuur/PDF | Alle calculatieversies ophalen; PDF-code direct downloaden; meerdere PDF-renders terwijl instellingen nog laden; download maakt dezelfde PDF opnieuw. | Alleen nieuwste calculatie, instellingen en bedrijf parallel, PDF pas met complete gegevens. PDF-module op aanvraag; voorvertoning en download delen dezelfde blob zolang alle invoer gelijk is. |
| PDF-afbeeldingen | Hetzelfde logo werd voor iedere generatie opnieuw omgezet via de API. | Tijdelijke cache op volledige afbeeldings-URL, maximaal acht afbeeldingen; mislukte verzoeken kunnen opnieuw worden uitgevoerd. |
| Foto's | Kleine galerijvakjes laadden volledige originele foto's, maximaal 15 MB per bestand. | Bestaande Firebase-foto's via Next/Sharp verkleinen; nieuwe foto's krijgen een aparte voorvertoning van maximaal 640 px. Originelen blijven beschikbaar voor volledig bekijken en bijlagen. Fallback bij ontbrekende voorvertoning. |
| Kostenlijst | Kosten wachtten op alle offertelabels/facturen. Tabwisselingen herstartten reads. | Kosten en labels onafhankelijk laden; overlappende reads delen; tabwisselingen herstarten geen initialisatie. Na wijzigen altijd een nieuwe read; eerdere responses mogen die niet overschrijven. |
| Bank/financieel | Eerst externe Knab-sync afwachten, daarna pas opgeslagen gegevens ophalen. | Opgeslagen bankgegevens direct lezen tijdens de sync, met zichtbare synchronisatiestatus en datum. Na afronding opnieuw lezen; fouten zichtbaar houden. |
| Bank-/kostenkoppelingen | Leveranciersnamen, factuurreferenties, bedragen en datums werden voor vrijwel ieder kosten-/betalingspaar opnieuw verwerkt. | Metadata eenmaal per rij voorbereiden; dezelfde matchregels en categorie-/btw-verdeling. |
| Offertepagina | Materiaalcatalogus en financiële betaalregels al laden wanneer de betreffende functies gesloten zijn; zware tabmodules in initiële bundel. | Catalogus bij materiaalkeuze, betaalregels bij Financieel; PDF, tekeningen, calculatie, prijsboek en materiaalkeuze op aanvraag laden. Materiaallijsten gericht op de betreffende offerte ophalen. |
| Gedeelde achtergrondtaken | Gesloten kostenimportvenster haalde alle offertes en facturen op; urenlabel haalde maximaal 1.000 historische urenregels op. | Offertekeuzes alleen voor geopend importvenster. Uren voor de huidige dag en, op de detailpagina, alleen de betreffende offerte. Werkbesprekingsquery gericht op dit planningstype. |

## Metingen

- **Bank-/kostenverwerking, echte huidige dataset, alleen lezen:** 264 kosten en 267 transacties. Mediaan circa **200 → 15 ms**, circa **13× sneller**. De 231 kasboekregels en 259 uitgesplitste categorieregels waren vóór/na volledig gelijk. Dit is verwerkingstijd, geen totale paginalaadtijd.
- **Fototransformatie, synthetische 4032 × 3024-foto:** JPEG 8.596.078 bytes → WebP 640 × 480 van 10.902 bytes. De werkelijke Next/Sharp-transformatie duurde circa 67 ms. De verkleining verschilt per foto; dit is geen meting van een klantfoto of volledige galerij.
- **Eenmalige database-/netwerksteekproef:** kosten 770 KB / 848 ms; bankverbinding, accounts en transacties samen circa 687 ms. De kosten-API voert deze twee takken al parallel uit. Deze tijden mogen niet worden opgeteld tot een paginalaadtijd. De kostenquery gebruikt een index; er zijn geen databaseschema's aangepast.
- Lokale ontwikkeling compileert routes bij het eerste bezoek. De eerste HTTP-aanvraag aan `/offertes` duurde tijdens deze controle circa 4,1 seconden inclusief compilatie. Dit is geen productiebenchmark.

## Controle

- TypeScript-controle en definitieve productiebuild geslaagd; 32 gerichte regressietests geslaagd.
- `scripts/invoice-performance.test.cjs`: parallelle initialisatie, voorschotcontrole, gelijktijdige wijzigingen en PDF-/afbeeldingscache.
- `scripts/quote-photo-preview.test.cjs`: afmetingen, oorspronkelijke bestanden, fallback, toegestane Firebase-paden en werkelijke Next/Sharp-transformatie.
- `scripts/cost-loading-performance.test.cjs` en `scripts/finance-invoice-matching.test.cjs`: gelijktijdige reads, verversen na opslaan, syncvolgorde, foutafhandeling en bestaande financiële koppelingen.
- `scripts/time-entry-read.test.cjs`: eigenaar-/dag-/offertefilters, bestaande historie, ongeldige invoer en authenticatie.
- Bestaande factuur-PDF-, offertevertaling- en PDF-instellingentests geslaagd; gerichte lintcontrole en `git diff --check` geslaagd. De kostenpagina heeft twee bestaande hookwaarschuwingen.
- HTTP-controle van de gebouwde offerte-, nieuwe factuur-, bestaande factuur- en kostenroute: HTTP 200. Kosten- en uren-API zonder authenticatie: HTTP 401. Dit verifieert de serverroutes, niet het ingelogde formulier.

## Grenzen van de verificatie

De browsertoegangspolicy blokkeerde de ingelogde browsersessie. Daarom is geen nieuwe klik-tot-bruikbaar-meting in het echte factuurformulier, de fotogalerij of Kosten beschikbaar. Er zijn geen facturen aangemaakt of berichten verstuurd voor deze controle. De wijzigingen staan lokaal; er is geen deployment uitgevoerd.

De resterende wachttijd omvat nog netwerkverzoeken, authenticatie, eventuele serverstart en de eerste afbeeldingstransformatie. Die is met deze controles niet volledig uit te sluiten. De leesresultaten van kosten en factuurvoorbereiding worden niet langdurig gecachet om financiële wijzigingen actueel te houden.
