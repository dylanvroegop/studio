# GPS-bewaking

De servercontrole `POST /api/tracking/monitor` gebruikt de bestaande automatiseringsauthenticatie (`x-offertehulp-secret`, `N8N_HEADER_SECRET`, `CALVORA_USER_ID`). De n8n-workflow in `n8n/gps-monitor.workflow.json` draait elke vijf minuten, onafhankelijk van de geopende app.

- Een GPS-punt van minimaal twintig minuten oud start direct een incidentmelding.
- Zonder bruikbare punten of bij een onbereikbare GPS-server wordt eerst twintig minuten aanhoudende uitval afgewacht. Daarna volgt een melding.
- Herstel wist het incident. Een nieuw incident krijgt een nieuw eventId.
- Bij aanhoudende uitval volgt daarnaast elke dag vanaf 19:00 (Europe/Amsterdam, ook in wintertijd) een herinnering om de GPS en gewerkte uren te controleren. Een eigen dagelijkse trigger controleert om 19:00; de vijfminutencontrole kan een gemiste uitvoering later die avond inhalen. Dit geldt ook als de GPS-server onbereikbaar is of geen bruikbare punten ontvangt, na de bestaande wachttijd van twintig minuten.
- De dagelijkse herinnering heeft een vaste sleutel per datum: herhaalde controles geven geen dubbele geaccepteerde push. Herstel stopt de herinneringen; een nieuwe storing op dezelfde avond veroorzaakt geen tweede dagherinnering.
- De bestaande app-inbox en pushservice bewaren de melding en voorkomen dubbele geaccepteerde pushes per incident en apparaat. Mislukte verzendingen blijven herkansbaar.
- De healthcontrole leest recente punten, zodat een oud toekomstpunt niet langer herstel blokkeert.

## Activering

1. Deploy de monitorroute en bijbehorende libraries, samen met de bijgewerkte healthroute.
2. Importeer de workflow en selecteer de bestaande headercredential met `x-offertehulp-secret`.
3. Controleer een handmatige uitvoering en activeer vervolgens de workflow.
4. Controleer op de echte telefoon dat de appmeldingen zichtbaar zijn.

Status 19 oktober 2026: lokaal geïmplementeerd, workflow niet geïmporteerd/geactiveerd. De ingestelde n8n API-sleutel geeft HTTP 401. Live test via de bestaande pushroute: drie providers accepteerden de testmelding, waaronder de geregistreerde Apple-pushprovider. Dit bewijst geen weergave op de telefoon. De vijf GPS-tests slagen; de bestaande pushsuite heeft één afwijkende fallback-routeverwachting (`/dashboard` versus huidige `/offertes`).
