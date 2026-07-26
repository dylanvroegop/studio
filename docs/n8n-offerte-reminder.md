# Dagelijkse Telegram-herinneringen voor offertes en materialen

De Calvora-route `GET /api/offertes/concept-reminder` geeft alle niet-gearchiveerde offertes met status `concept` terug voor `CALVORA_USER_ID`. De route gebruikt dezelfde beveiliging als de bestaande automatiseringen:

- header `x-offertehulp-secret` moet gelijk zijn aan `N8N_HEADER_SECRET`;
- optioneel header `x-offertehulp-user-id`; anders wordt `CALVORA_USER_ID` gebruikt;
- facturen met status `gedeeltelijk_betaald` of `betaald` worden als geaccepteerd beschouwd en niet opnieuw gemeld.

Voor de materiaallijst zijn twee extra routes toegevoegd:

- `GET /api/material-lists/reminder` geeft alleen echte, niet-afgevinkte items uit de algemene materiaallijst terug;
- `POST /api/material-lists/reminder/complete` markeert een item veilig als opgepakt na een Telegram-knopklik.

## n8n-workflow

De workflow staat al als draft in n8n:

- Naam: `Calvora Offerte Reminder`
- Workflow-ID: `nATFqqOnMCJdjbgJ`
- [Open workflow in n8n](https://n8n.srv1553475.hstgr.cloud/workflow/nATFqqOnMCJdjbgJ)

Hij blijft bewust uitgeschakeld totdat de nieuwe Telegram-botcredential en de Calvora-headercredential zijn gekoppeld. De n8n MCP-koppeling kon de bestaande Telegramcredential automatisch koppelen, maar kan geen nieuwe BotFather-token of geheim credential voor je aanmaken.

De workflow bestaat uit deze keten:

1. **Schedule Trigger** — dagelijks, 20:00. Controleer in n8n dat de workflow-timezone `Europe/Amsterdam` is.
2. **HTTP Request** — `GET https://app.calvora.nl/api/offertes/concept-reminder`.
   Voeg `x-offertehulp-secret` toe als header. Gebruik de n8n credential of environment variable voor de waarde; zet het geheim niet in een publieke export.
3. **Code** — stop als `shouldAlert` niet `true` is en bouw anders één Telegram-bericht met alle `quotes`.
4. **Telegram → Send Message** — stuur naar je persoonlijke chat-ID van de nieuwe bot.

Dezelfde workflow heeft daarnaast een tweede dagelijkse keten:

1. **Schedule Trigger** — dagelijks, 06:30.
2. **HTTP Request** — `GET https://app.calvora.nl/api/material-lists/reminder`.
3. **Code** — maak voor elk open materiaal-item een apart bericht.
4. **Telegram → Send Message** — stuur elk item met de inline-knop **✅ Opgepakt**.

Na een klik verwerkt de callback-keten `POST /api/material-lists/reminder/complete`. Het item wordt dan in Calvora afgevinkt en verschijnt niet meer in de volgende ochtendmelding. Items waarop niet wordt geklikt blijven open en worden de volgende dag opnieuw gestuurd.

Voorbeeld:

```text
🛒 Materiaal ophalen

Zwarte kitten.
Aantal: 1 st

[✅ Opgepakt]
```

De workflow bevat daarnaast **Nieuwe bot koppelen**. Gebruik deze eenmalig door `/start` naar de nieuwe bot te sturen; daarna bewaart n8n de chat-ID in workflow-static-data en is geen handmatige chat-ID nodig.

Voorbeeldtekst:

```text
🔔 Offertes om te maken (3)

• Chris Palmen — offerte #260384
  Quote needs to be made
  https://app.calvora.nl/offertes/...

• Rohit — offerte #260379
  Quote needs to be made
  https://app.calvora.nl/offertes/...

• Debby Salomons — offerte #260375
  Quote needs to be made
  https://app.calvora.nl/offertes/...
```

De Telegram-nodes moeten `appendAttribution: false` gebruiken. Als dit echt een nieuwe bot moet zijn, maak hem aan via `@BotFather`, gebruik de nieuwe bot-token in een aparte n8n Telegram credential en koppel die credential aan alle Telegram-nodes, inclusief de callback-node. Maak daarnaast een n8n Header Auth credential met headernaam `x-offertehulp-secret` en de waarde van `N8N_HEADER_SECRET`, en koppel die aan alle drie HTTP-nodes. Publiceer daarna de workflow.
