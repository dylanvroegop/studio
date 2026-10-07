# Telegram-workflow: gecontroleerd herstel op 15 september 2026

Workflow: `auto making client` (`Xal6adg1neOkMczi`).

## Eén afspraakvoorstel en verder vooruit zoeken — 6 oktober 2026

**n8n-berichttekst gepubliceerd:** `Eén afspraakvoorstel en klantbericht bij ontbrekende datum`.
De editor bevestigde **Published**. Alleen de expressie van
`Send a text message4` is gewijzigd; de teruggedownloade workflow bevat dezelfde
29 nodes, verbindingen, credentials, overige parameters en instellingen.

- Eén opgeslagen datum/tijd wordt genoemd, ook als een oudere API-reactie nog
  twee opties bevat. De klant krijgt de vraag: “Mocht dit moment niet uitkomen,
  welke dag en tijd zouden u beter uitkomen?”
- Ontbreekt een bruikbaar voorstel, dan volgt een klantbericht dat naar
  beschikbaarheid vraagt. De melding “Er is geen afspraakvoorstel beschikbaar”
  is verwijderd. Er wordt geen datum verzonnen.
- Bevestigde afspraken blijven als bevestigd gemeld. Werkelijke importfouten,
  identiteitsconflicten en ongeldige datums blijven afzonderlijk afgehandeld.

De lokale Calvora-reparatie in `appointment-suggestions.ts` zoekt verder dan
de oorspronkelijke vier dagen tot een vrije ingestelde werkdag, ook na twee
weken. Hij retourneert één voorstel. De import-API vervangt oude tweedatumteksten
en herstelt eerder gecachete reacties zonder voorstel op dezelfde offerte.
Deze API-reparatie is nog niet gedeployed: Vercel CLI meldt `login_required`.

Reproduceerbare n8n-wijziging:

```sh
node scripts/single-appointment-workflow.cjs /pad/naar/export.json /pad/naar/gewijzigd.json
TELEGRAM_SINGLE_APPOINTMENT_EXPORT=/pad/naar/export.json node --test scripts/single-appointment-workflow.test.cjs scripts/harden-telegram-workflow.test.cjs
node --test scripts/telegram-appointment-proposals.test.cjs scripts/telegram-client-identity.test.cjs
```

De nieuwe n8n-expressie is offline uitgevoerd met gesimuleerde API-reacties.
De volledige gerichte regressierun slaagt: 76 tests, plus twee bestaande
exportafhankelijke tests over de historische datumreparatie die zijn overgeslagen.
De afzonderlijke voorstel-/API- en identiteitstests slagen alle 29; gerichte lint,
TypeScript-controle en `git diff --check` slagen eveneens.
Er is geen echte Telegram-inzending uitgevoerd en er zijn geen klantberichten,
klanten of afspraken aangemaakt tijdens de controle. Privéback-ups en exports:
`/tmp/studio-single-appointment/`. Een aparte uitrolkopie, zonder de overige
lokale wijzigingen, staat in `/tmp/studio-single-appointment-deploy/`.
Deze uitrolkopie bevat uitsluitend de twee gewijzigde runtimebestanden,
de benodigde bestaande identiteitshelper en de twee bijbehorende tests bovenop
productiecommit `ae8e6a7fa91028b3286e691d85ee73a304f7aa2d`.
De definitieve productiebuild en volledige typecheck van die kopie slagen.
Er is niets gecommit, gepusht of via Vercel gedeployed.

## Verkeerd afspraakjaar — 18 september 2026

**Gepubliceerd en actief:** `Actuele datum gebruiken en oude afspraakdatums blokkeren`.
Na publicatie bevestigde de n8n-editor **Published**.

Uitvoering **1628** verwerkte een klantbevestiging voor zaterdag 19 september,
17:00. De screenshot noemde geen jaartal. Het daadwerkelijke AI-verzoek bevatte
letterlijk `{{ $now.setZone('Europe/Amsterdam').toISODate() }}`: het systeem-prompt
stond op **Fixed**, waardoor n8n de datumexpressie niet uitvoerde. De AI gaf
`2020-09-19` terug. Calvora en Google Agenda accepteerden die datum; de afspraak
werd in 2020 aangemaakt en de uitvoering rapporteerde technisch terecht succes.

De reparatie staat in `scripts/protect-telegram-dates.cjs`:

- Systeem-prompt op **Expression** (`=`-voorvoegsel in de export). De n8n-preview
  toonde de echte referentiedatum `2026-09-18`.
- Expliciete regels voor datums zonder jaar, jaarwisseling, weekdagconflicten en
  historische berichten. Een expliciet genoemd oud jaar wordt niet stil aangepast.
- De node `Kies bestaande sessie` controleert de AI-datum en daarna de samengevoegde
  sessiedatum, vóór aanmaken/bijwerken van sessie, klant of agenda. Een datum vóór
  vandaag in Amsterdam, een ongeldige kalenderdatum of een onvolledige bevestiging
  stopt via de bestaande foutuitgang. De foutdatum wordt niet automatisch naar
  een ander jaar verschoven.

Controle: 36 lokale tests geslaagd, inclusief het incident met 2020, correcte
bevestiging in 2026, schrikkeldagen, jaarwisseling, ontbrekende referentiedatum,
oude sessiedatums en de bestaande identiteits-/volgordescenario's. De tests voeren
ook de volledige sessiecode uit de aangepaste echte export uit met gesimuleerde
n8n-invoer. De teruggedownloade draft is exact vergeleken: dezelfde 29 nodes,
verbindingen, credentials en instellingen, met uitsluitend de twee beoogde
parameterwijzigingen en zonder pinned data.

```sh
TELEGRAM_DATE_WORKFLOW_EXPORT=/pad/naar/export-voor-datumreparatie.json node --test scripts/protect-telegram-dates.test.cjs scripts/resolve-telegram-session.test.cjs scripts/telegram-identity-scenarios.test.cjs
```

Geen echte Telegram-inzending opnieuw uitgevoerd en geen afspraken of klanten
gewijzigd tijdens de tests. De bestaande afspraak uit 2020 is niet verplaatst.
Privé-back-up en gecontroleerde exports: `/tmp/studio-appointment-date-fix/`.

## Incident klantverwisseling — 17 september 2026

**Actuele status: de n8n-reparatie is gepubliceerd en actief.**
Versienaam: **Klantverwisseling blokkeren bij iedere screenshot**.
De editor bevestigde `Published` op 17 september na de laatste controles.
De extra API-bescherming is lokaal klaar, maar nog niet uitgerold: Vercel CLI
vereist opnieuw aanmelden. De n8n-identiteitscontrole is zelfstandig actief;
tegenstrijdige oude sessies worden geblokkeerd totdat de juiste gegevens zijn
vastgesteld. De vervuilde historische klant- en offertegegevens zijn niet op
basis van aannames gewijzigd. De onderstaande gegevens van 15 september zijn
historische informatie.

Live gelezen gegevens toonden drie verschillende klantnamen met hetzelfde
telefoonnummer/e-mailadres in oude Supabase-sessies. Hun offertes verwezen naar
hetzelfde Firestore-klantdocument. Een later gecorrigeerde offerte behield nog
die verkeerde `clientId`. Ook opgeslagen calculaties bevatten vervuilde contacten.
Dit bewijst dat klantgegevens zijn vermengd; de oorspronkelijke uitvoeringsstap
die het nummer als eerste verkeerd overnam is nog niet vastgesteld.

Aanvullend onderzoek naar het door elkaar insturen van screenshots: de originele
export `auto making client.json` (versie `506bc34b-0778-42ab-9103-71ee0c0747d4`,
gedownload op 14 september vóór de toenmalige reparatie) bevatte een concrete
foutroute. `Get a row1` zocht uitsluitend op `appointment_status = not_found`,
zonder klantnaam, telefoon of chat-ID. `If` controleerde alleen of die status
bestond. De planningscode nam vervolgens `$('If').first().json` als basis en
voegde de niet-lege AI-velden samen met de bestaande klantgegevens.

De ongewijzigde code uit deze oude export is op 17 september offline uitgevoerd
met synthetische gegevens. Beide scenario's zijn gereproduceerd:

1. A staat zonder afspraak opgeslagen; screenshot B bevat naam en afspraak maar
   geen telefoon/e-mail. Resultaat: naam B met telefoon/e-mail A, op sessie A.
2. A en B staan open; B wordt als eerste zoekresultaat teruggegeven; een
   vervolgscreenshot A zonder contactgegevens levert naam A met telefoon B op.

De fout vereist dus geen foutieve AI-uitlezing en geen twee gelijktijdige
uitvoeringen. Ook één screenshot met afspraak kon al een openstaande andere
klant raken. De exacte oorspronkelijke uitvoeringsreeks van het incident is
hiermee niet bewezen; wel is het mechanisme in de oude workflow aangetoond.

De oude API koos de eerste match op telefoon, anders e-mail, anders naam/plaats,
en overschreef daarna de klantgegevens zonder tegenstrijdigheden te controleren.
Een herhaalde `lead_key` kon bovendien een eerder resultaat teruggeven of
bijwerken zonder opnieuw de klantidentiteit te controleren.

Bescherming in n8n en aanvullende API-wijziging:

- `scripts/protect-telegram-identity.cjs` migreert de export met sessieroutering.
  De zoeknode haalt alle sessies van dezelfde Telegram-chat op. De selectienode
  controleert zelf naam, contact en klus. Eén toevallige rij is geen identiteit.
- Ook een expliciet telefoonnummer mag tegenstrijdige oude sessies op dezelfde
  naam en plaats niet negeren. Naamverschillen bij een gedeeld contact, conflicterende contactgegevens en
  oude contacten onder verschillende klantnamen stoppen vóór sessie-opslag.
  Alleen naam, of alleen naam/plaats zonder contact of klus, erft geen oud nummer.
- Het AI-prompt beperkt contactextractie tot de zichtbare actieve klantconversatie.
  Dit is een aanvullende instructie, geen garantie op foutloze beeldherkenning.
- De API vergelijkt alle contactmatches en controleert identiteit binnen de
  schrijfttransactie. Conflicten geven HTTP 409 `CLIENT_IDENTITY_CONFLICT` met
  `success: false`, zonder writes. Ook bij herhaalde sessies worden het
  klantdocument, de offerte-identiteit en `clientId` opnieuw gecontroleerd.

Verificatie:

```sh
node --test scripts/resolve-telegram-session.test.cjs scripts/harden-telegram-workflow.test.cjs scripts/telegram-client-identity.test.cjs scripts/telegram-identity-scenarios.test.cjs
npm run typecheck
npx eslint src/app/api/telegram-leads/import/route.ts src/lib/telegram-client-identity.ts
git diff --check
```

48 tests slagen, inclusief dertien volgorde-/conflictscenario's en tests van de echte API-handler met een gesimuleerde
database: verkeerde klant/telefoon, gesplitste telefoon/e-mail, verkeerde
sessiesleutel en een vervuilde bestaande offerte leveren geen writes op.
Typecheck, gerichte lint en de productiebuild slagen. De geïsoleerde uitrolkopie
bevat alleen de twee runtimebestanden van deze reparatie bovenop de actuele
productiecommit `ae8e6a7fa91028b3286e691d85ee73a304f7aa2d`. De volledige lint heeft
bestaande fouten buiten deze reparatie; die zijn niet aangepast.
De definitieve n8n-configuratie is vóór publicatie teruggedownload
en gecontroleerd: 29 nodes, correcte parameters/credentials/verbindingen en geen
vastgezette input. n8n laat de standaardwaarde `filterType: manual` weg uit de
export; de UI bevestigde `Build Manually`, `All Filters` en `Return All`.

De code uit die export is offline op zes bestaande sessies getest, zonder
netwerkverkeer of writes: alle drie aantoonbaar vervuilde sessies en twee ambigue
vervolgsessies stopten; de afzonderlijk herkenbare schone sessie bleef correct
gekoppeld. Er zijn geen klantberichten verstuurd of bestaande klantgegevens
gewijzigd. Correcte contactgegevens moeten nog door de eigenaar worden bevestigd;
leid die niet af uit de nu conflicterende documenten. Privéback-ups van de
onderzochte sessies, calculaties en workflow staan buiten de repository in
`/tmp/studio-client-identity-incident/`.

Aanvullende controles vóór publicatie:

- Dertien synthetische scenario's uitgevoerd in een geïsoleerde n8n-Code-node:
  A1/B1/A2, A1/B1/B2, omgekeerde databasevolgorde, één screenshot met afspraak,
  ontbrekende/tegenstrijdige identiteit en opnieuw insturen. Alle dertien `PASS`.
- De werkelijke Supabase-node las 65 sessies. De definitieve controle blokkeerde
  alle drie bekende vervuilde sessies. Resultaat: `PASS`, `writes: 0`, `messages: 0`.
- Beide testtakken zijn verwijderd, de laatste uitvoeringsdata is leeggemaakt.
  De gedownloade configuratie bevat exact 29 productienodes, dezelfde geteste
  code, foutverbindingen en credentials, geen testnodes en geen pinned data.
- Gepubliceerd na deze vergelijking, vervolgens `Published` in de UI bevestigd.
- Alle vijf oude wachtende uitvoeringen (1583, 1598, 1599, 1605, 1610) zijn
  bekeken: alleen `Wait1` wacht nog. Dit is de herinneringstak met lezen en
  terugmelden; geen uitvoering wacht nog in de oude sessie-opzoeklus `Wait`.

De testscenario's staan in `scripts/telegram-identity-scenarios.cjs` en draaien
ook lokaal via de bijbehorende `node:test`-test. De tests hebben geen echte
Telegram-berichten verstuurd en geen klanten of agenda-afspraken aangemaakt.

Deze controles voorkomen de aangetoonde automatische vermengingsroutes. De
AI-beeldherkenning is niet opnieuw getest en kan geen foutloze uitlezing
garanderen. De aanvullende Calvora-API-bescherming is nog niet live; historische
offertes zijn nog niet hersteld. Voor hervatting van die deployment is de
uitrolkopie beschikbaar in `/tmp/studio-client-identity-deploy`.

## Vastgestelde oorzaak

Uitvoering 1580, 15 september om 13:23, gaf vanuit Calvora `success: true`,
een klant-ID en offerte-ID terug, maar `appointment_status: none` en
`telegram_message: null`. Telegram verstuurde vervolgens letterlijk `null`.
`If2` bevatte een expressie met tekstspaties vóór `{{ ... }}` en losse
typeconversie. De bedoelde controle hield deze reactie niet tegen.

Geen voorstel is een geldige uitkomst: de Calvora-planner zoekt binnen
1–4 dagen en kan geen vrije plek vinden. Daarom mag ontbreken van een
voorsteltekst niet als mislukte klantimport worden behandeld. De precieze
reden waarom uitvoering 1580 geen voorstel kreeg, is niet vastgesteld.

Uitvoering 1584 om 15:20 las de bevestiging correct uit, maar vond drie
Supabase-sessies voor dezelfde klant, contactgegevens en klus. De controle op
precies één resultaat wees alle drie af. De foutnode verstuurde daardoor drie
meldingen. De daaropvolgende agenda-aanmaak om 15:24 was een handmatige
hersteluitvoering, geen vertraagd herstel van de mislukte uitvoering.

## Gepubliceerde wijzigingen

- Strikte succescontrole op boolean `success` plus geldige klant- en offerte-ID's.
- Een bruikbare terugmelding als voorsteltekst ontbreekt; afzonderlijke tekst
  voor een bestaande bevestigde afspraak, een voorstel of geen voorstel.
- De eerste import verstuurt één JSON-object met echte nulls. Namen met
  aanhalingstekens of nieuwe regels breken de JSON niet meer.
- Ontbrekende sessie of onvoldoende klantidentiteit stopt de import.
- Alleen de eerste, afspraakloze Calvora-import krijgt maximaal drie pogingen,
  met dezelfde sessiesleutel en een timeout van 30 seconden per poging.
  Aanmaken van Supabase-rijen en Google Agenda-afspraken krijgt geen retries.
- Foutuitgangen van AI, klantopslag, klantopzoeking, agendalezen, planning en
  import leiden naar de bestaande Telegram-foutmelding.
- Geen eenduidige klantmatch geeft een melding, zonder eindeloze wachtroute.
- Lege klant- en agendaresultaten gaan door naar de bestaande controle/code.
- De planner controleert 60 minuten, overeenkomstig het opgeslagen agendablok,
  en stopt als geen vrij blok bestaat. Bevestigde tijden blijven behouden.
- De herinnering na twee dagen start uitsluitend na bevestigde import.
- Iedere inzending zoekt eerst een bestaande sessie. Meerdere rijen worden
  alleen samengenomen bij overeenkomstige contactgegevens en klus, zonder
  conflicterende identiteit. Bevestigde sessies krijgen voorrang; anders wordt
  de meest recente passende sessie gebruikt. Bestaande gegevens blijven behouden.
- Nieuwe klanten gaan via aanmaken naar dezelfde afspraakcontrole. Een
  onduidelijke match stopt eenmaal; de foutnode draait eenmaal per invoerset.
- Een bestaande agenda-afspraak op de opgegeven dag wordt herkend via de
  sessiemarkering of de bestaande klant-, telefoon- en werkregels. Opnieuw
  verwerken werkt die afspraak bij. Meerdere passende afspraken geven een fout.

Laatste gepubliceerde versienaam: **Bestaande klant en agenda-afspraak hergebruiken**.

## Regressiecontrole

De reproduceerbare wijziging staat in `scripts/harden-telegram-workflow.cjs`.
Dit is een gerichte migratie van de onderzochte export, geen algemene reparatie
van willekeurige latere versies. Hij stopt als de verwachte planningscode wijzigt.

```sh
node --test scripts/harden-telegram-workflow.test.cjs
TELEGRAM_WORKFLOW_EXPORT=/pad/naar/oorspronkelijke-export.json node --test scripts/harden-telegram-workflow.test.cjs
```

Met de oorspronkelijke export slagen 13 tests. Zonder export draaien de acht
zelfstandige tests van importvalidatie, berichten en expressies.

In n8n zelf zijn daarnaast 13 synthetische reacties door dezelfde If-expressie
gestuurd: 9 geldige imports en 4 ongeldige imports. Beide controle-nodes gaven
`PASS`; er waren nul null-berichten. Alleen de geïsoleerde handmatige testtak
draaide, zonder klantopslag, Telegram-verzending of Google Agenda-wijzigingen.
Daarna zijn alle testnodes verwijderd.

De vervolgmigratie staat in `scripts/resolve-telegram-session.cjs`. Deze neemt
de export na de eerste reparatie als invoer. Voer de migraties niet opnieuw
over een al gemigreerde export uit.

```sh
node --test scripts/resolve-telegram-session.test.cjs
TELEGRAM_WORKFLOW_EXPORT=/pad/naar/export-na-eerste-reparatie.json node --test scripts/resolve-telegram-session.test.cjs
```

Met die export slagen 17 tests; zonder export draaien 16 zelfstandige tests.
Deze dekken onder andere drie identieke sessies, tegenstrijdige contactgegevens,
behoud van bevestigingen, telefoonnormalisatie en hergebruik van agenda-afspraken.

De correcte AI-uitvoer uit uitvoering 1584 is vervolgens opnieuw verwerkt met
de echte Supabase-, Calvora- en Google Agenda-stappen. Drie sessies werden één
match. De afspraak voor 19 september 2026 van 19:00 tot 20:00 is opgeslagen in
Calvora en Google Agenda, met één succesmelding in de Telegram-chat van de
eigenaar. Een tweede verwerking via de update-node behield hetzelfde agenda-ID
en de oorspronkelijke aanmaaktijd. Daarbij is geen tweede succesbericht verstuurd.

De uiteindelijke download is vergeleken met de geteste configuratie: 29 nodes,
overeenkomstige parameters, credentials en verbindingen, geen testnodes en geen
vastgezette replaygegevens. De editor bevestigde `Published`.

## Grenzen van deze controle

De herstelcontrole hergebruikte de aantoonbaar correcte AI-uitlezing; ontvangst
en beeldherkenning zijn niet opnieuw uitgevoerd. Oude dubbele sessies zijn
bewaard. Reeds wachtende uitvoeringen kunnen hun oude configuratie behouden.
Gelijktijdige eerste inzendingen zijn niet met een databasevergrendeling beschermd.
Agendahergebruik zoekt binnen de opgegeven dag; verplaatsen naar een andere dag
is hiermee niet bewezen. Herhaal bij een fout niet blind de hele workflow:
controleer eerst welke opslagstappen zijn voltooid.

Volledige n8n-exports bevatten bestaande authenticatieheaders. Bewaar ze privé
en voeg ze niet toe aan git. De migratiescriptcode en tests bevatten geen secrets.
