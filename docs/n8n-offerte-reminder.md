# Dagelijkse Telegram-herinnering voor concept-offertes

De Calvora-route `GET /api/offertes/concept-reminder` geeft alle niet-gearchiveerde offertes met status `concept` terug voor `CALVORA_USER_ID`. De route gebruikt dezelfde beveiliging als de bestaande automatiseringen:

- header `x-offertehulp-secret` moet gelijk zijn aan `N8N_HEADER_SECRET`;
- optioneel header `x-offertehulp-user-id`; anders wordt `CALVORA_USER_ID` gebruikt;
- facturen met status `gedeeltelijk_betaald` of `betaald` worden als geaccepteerd beschouwd en niet opnieuw gemeld.

## n8n-workflow

Maak een aparte workflow met deze keten:

1. **Schedule Trigger** — dagelijks, 20:00, timezone `Europe/Amsterdam`.
2. **HTTP Request** — `GET https://app.calvora.nl/api/offertes/concept-reminder`.
   Voeg `x-offertehulp-secret` toe als header. Gebruik de n8n credential of environment variable voor de waarde; zet het geheim niet in een publieke export.
3. **Code** — stop als `shouldAlert` niet `true` is en bouw anders één Telegram-bericht met alle `quotes`.
4. **Telegram → Send Message** — stuur naar je persoonlijke chat-ID van de nieuwe bot.

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

De Telegram-node moet `appendAttribution: false` gebruiken. Als dit echt een nieuwe bot moet zijn, maak hem aan via `@BotFather`, voeg de nieuwe bot één keer toe aan Telegram en gebruik de nieuwe bot-token in een aparte n8n Telegram credential. De chat-ID wordt daarna als ontvanger in de workflow ingesteld.
