# Werkbespreking afronden via GPS

Een Telegram-werkbespreking wordt na een aantoonbaar bezoek op de afspraakdag uit Google Agenda verwijderd. Het bezoek blijft als `completed` in `planning_entries` bewaard, inclusief adres, apparaat, GPS-bewijs en vertrektijd. Een offerte die nog op `werkbespreking` staat gaat naar `concept`.

De controle draait elke twee minuten zolang de app zichtbaar is, bij terugkeer naar de app en vóór de volgende Telegram-import. Met gesloten app is er geen aparte achtergrondtimer: de volgende import controleert eerst het bezoek voordat zij beschikbaarheid bepaalt.

Voorwaarden:

- Het ingestelde Traccar-device behoort aan `CALVORA_USER_ID`.
- De afspraak hoort rechtstreeks bij een offerte met een volledig projectadres. Geocodering moet één exact gebouwadres opleveren.
- Minimaal tien minuten aaneengesloten verblijf, maximaal twee minuten tussen meetpunten, maximaal 25 meter GPS-onzekerheid en maximaal 5 km/u. De onzekerheidscirkel moet binnen 50 meter van het adres vallen.
- Daarna minstens twee betrouwbare vertrekmetingen met minstens één minuut ertussen. Ontbrekende GPS-data tellen niet als vertrek.
- Meerdere actieve offertes op hetzelfde adres of nabije kandidaat-afspraken leveren geen automatische afronding op.
- Alleen dezelfde afspraakdag telt; de werkelijke bezoektijd mag vroeger zijn dan de geplande tijd.

De Google-koppeling, offerte-ID, tijden en eventversie worden vóór verwijdering gecontroleerd. Een gedeelde synchronisatievergrendeling voorkomt gelijktijdig opnieuw boeken. Bij een mislukte verwijdering blijft de reservering bezet en kan de controle opnieuw proberen.

Na afronding telt de oorspronkelijke afspraak niet meer als bezetting. Het automatische bericht mag het vrijgekomen avondslot van vandaag voorstellen als dat nog in de toekomst ligt en vrij is. Een herhaalde import van dezelfde afgeronde sessie boekt die afspraak niet opnieuw; een nieuwe klantimport kan het vrijgekomen slot gebruiken.

Benodigd op de server: `CALVORA_USER_ID`, `TRACCAR_API_TOKEN`, `TRACCAR_DEVICE_IDENTIFIER`, optioneel `TRACCAR_SERVER_URL`, een Google-geocodingsleutel en een gekoppelde Google Agenda.

Validatie gebeurt met synthetische gegevens in `scripts/appointment-visit-completion.test.cjs`, de bestaande kalender-/importtests en `src/lib/quote-visit-gps.test.ts`. Dit document bevestigt geen deployment of live GPS-bezoek.
