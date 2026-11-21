# Bouwmaat-route en avondmelding

De bestaande Route-knoppen op Offertes, de offerte en de planningsafspraak gebruiken `SmartRouteButton`.

- Alleen tussen 05:00 (inclusief) en 10:00 (exclusief), Europe/Amsterdam.
- Alleen op de eerste geplande werkdag van dezelfde offerte; ook eerder voltooide dagen tellen mee. Geannuleerde, voorlopige, GPS-historie- en werkbesprekingsblokken tellen niet als eerste werkdag.
- De gebruiker kiest **Via Bouwmaat naar klant** of **Direct naar klant**. Maps krijgt één concrete vestiging als tussenstop en het projectadres als eindbestemming.
- De routeberekening vergelijkt maximaal vijf nabijgelegen operationele Bouwmaat-vestigingen op rijtijd vanaf de vertrekplek. Alleen vestigingen met bevestigde actuele openingstijden gedurende de volledige stop worden gekozen. Dit is geen garantie dat de gekozen vestiging de kortste totale omweg geeft of materialen op voorraad heeft.
- Aankomst volgt de geplande begintijd (standaard 08:00, ook bij hele-dagblokken). Dertig minuten materialen halen wordt tussen de twee ritten ingepland. Geen extra filebuffer.
- Routes API ondersteunt `arrivalTime` niet voor autoritten. Daarom wordt de verwachte vertrektijd terugberekend en opnieuw getoetst met `departureTime` en `TRAFFIC_AWARE_OPTIMAL`; de langste van de twee ritramingen wordt gebruikt. Reistijd blijft een schatting.
- De eerste afspraak van morgen bepaalt de vertrektijd in de avondmelding. Overige afspraken worden eronder vermeld, zonder aparte route-optimalisatie.

## Productievereisten

1. Een servervariabele `GOOGLE_MAPS_API_KEY`, of de bestaande `GOOGLE_API_KEY` / `GOOGLE_GEOCODING_API_KEY` / `ANTIGRAVITY_GOOGLE_API_KEY`, moet toegang hebben tot **Routes API** en **Places API (New)** met actieve Google Maps-facturering. De sleutel gaat uitsluitend naar Google vanaf de server.
2. Bestaande Firebase Admin-configuratie en pushabonnementen blijven in gebruik. Nieuwe collecties `departure_settings` en `departure_reminders` worden alleen via ingelogde serverroutes en Admin SDK benaderd; er is geen verruiming van Firestore-regels nodig.
3. De bestaande actieve n8n GPS-bewaking moet `/api/tracking/monitor` blijven aanroepen. Deze route voert nu ook `sendDepartureReminder` uit, vanaf 19:00 tot 23:00 Nederlandse tijd. Eén bericht per volgende kalenderdag; retries gebruiken dezelfde bericht- en afleveridentiteit.
4. Als die timer nog niet actief is, importeer `n8n/departure-reminder.workflow.json`. Deze controleert elke vijf minuten tussen 19:00 en 23:00 met timezone `Europe/Amsterdam` en POST naar `https://app.calvora.nl/api/planning/departure-reminder`. Koppel dezelfde Header Auth als de GPS-bewaking: `x-offertehulp-secret` overeenkomend met `N8N_HEADER_SECRET`. `CALVORA_USER_ID` bepaalt de ontvanger. Activeer geen tweede timer als de bestaande GPS-bewaking al werkt.

De app zelf hoeft niet open te staan. Zonder actieve externe timer wordt er geen avondpush verstuurd. Een succesvolle codebuild bewijst niet dat de Google-API's, timer of telefoonontvangst in productie werken.

## Vertrekplek

De ochtendroute gebruikt de huidige trackerlocatie, met telefoonlocatie als expliciete herberekenknop. De avondberekening gebruikt een opgeslagen vertrekadres voor uitsluitend morgen, of de laatste GPS-plek. Actuele fixes mogen maximaal 30 minuten oud zijn en maximaal 500 meter onnauwkeurig. Een expliciete stilstandfix (`motion: false`, snelheid nul/onbekend) wordt maximaal 24 uur als aanname gebruikt en ook zo benoemd. Een later bewegingspunt sluit de oude stilstandaanname uit. Testposities en toekomstige/ongeldige punten worden geweigerd. De servertracker is gebonden aan `CALVORA_USER_ID`; Supabase-query's zijn op gebruiker gefilterd.

Bij ontbrekende locatie, adres, API-toegang of bevestigde openingstijden wordt geen vertrektijd verzonnen. De avondmelding noemt dan de afspraak en het probleem. De gebruiker kan het vertrekadres in Planning aanpassen en **Bereken vertrek voor morgen** gebruiken. Bestaande avondmeldingen worden niet achteraf vervangen als de planning of vertrekplek verandert; controleer dan de actuele berekening.

## Controle

```sh
node --test scripts/departure-planning.test.cjs scripts/gps-monitor.test.cjs scripts/push-notifications.test.cjs
npm run typecheck
npm run build
```

Controleer in productie nog een echte GPS-route en ontvangst van een avondmelding; de unit-tests gebruiken gesimuleerde Maps-/tracking-/pushantwoorden.
