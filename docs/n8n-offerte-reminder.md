# Telegram: offerte maken na bezoek

[Open de workflow **Offerte maken na bezoek - dagelijks 19:00**](https://n8n.srv1553475.hstgr.cloud/workflow/TNM7ECaqt2WFAz6h).

Deze zelfstandige workflow controleert elke dag om **19:00 Europe/Amsterdam** welke offertes nog gemaakt/verstuurd moeten worden na een werkbespreking. Zomer- en wintertijd volgen de ingestelde tijdzone.

## Nog invullen in n8n

Open **Stuur offerte-herinnering**:

1. Kies de Telegramcredential van je bot (of maak die met je BotFather-token).
2. Vervang `VUL_JE_TELEGRAM_CHAT_ID_IN` door je persoonlijke Telegram-chat-ID.
3. Stuur de bot eenmaal `/start`, zodat de bot je berichten kan sturen.
4. Sla op en klik **Publish**.

De workflow is als ongepubliceerd concept opgeslagen. Er is geen Telegrambericht verstuurd tijdens de controle. De Calvora-gegevensbron is al verbonden met dezelfde bestaande beveiligde header als de andere Calvora-automatisering. Deze workflow heeft geen Telegram Trigger nodig en neemt dus geen bestaande botwebhook over.

## Wanneer krijg je een herinnering?

- De offerte heeft een gekoppelde of ondubbelzinnig herkenbare werkbespreking.
- De afspraak is bevestigd (`scheduled`, `in_progress` of `completed`) en de eindtijd is voorbij. Ontbreekt de eindtijd, dan wordt de geplande duur gebruikt, anders één uur.
- `pending`, geannuleerde, toekomstige afspraken en gewone werkdagen tellen niet mee.
- De offerte staat op `werkbespreking`, `concept`, `in_behandeling` of `in_afwachting` en is niet gearchiveerd.
- `verzonden` en `geaccepteerd` verdwijnen automatisch bij de volgende controle. Afgewezen/vervallen offertes en offertes met een deels of volledig betaalde factuur verdwijnen ook.
- Bij dezelfde klant kunnen meerdere open offertes worden meegenomen. Een afspraak van vóór het aanmaken van de offerte telt alleen wanneer die expliciet `completed` is en rechtstreeks aan deze offerte is gekoppeld. Zo geldt een verkeerd geïmporteerd bezoekjaar (bijvoorbeeld 2020 bij een offerte uit 2026) niet als bezoekbewijs. Een nieuwere nog open afspraak voor de offerte onderdrukt de herinnering.

Er bestaat in Calvora geen apart veld dat bewijst dat je werkelijk aanwezig was. Daarom geldt een afgelopen, bevestigde werkbespreking als bezoek. Zet afspraken die niet doorgingen op geannuleerd. Een afspraak zonder herkenbare offerte kan nog geen offerteherinnering opleveren.

Elke uitvoering leest opnieuw de actuele status. Er hoeft niets in Telegram afgevinkt te worden. Zonder open offertes wordt niets verstuurd; lange lijsten worden verdeeld over meerdere berichten.

Voorbeeld:

```text
🔔 Deze offertes moet je nog maken (1)

• Voorbeeld Klant — offerte #260001
  Wand plaatsen
  Bezoek: 6 oktober 2026
  https://app.calvora.nl/offertes/...

Dit blijft dagelijks terugkomen totdat de offerte verzonden of geaccepteerd is.
```

## Techniek en controle

De keten is **Dagelijks om 19:00 → Haal open concept-offertes op → Maak Telegram-herinnering → Stuur offerte-herinnering**.

`GET /api/offertes/concept-reminder` leest `quotes`, `planning_entries` en `invoices` voor dezelfde gebruiker. De route controleert `x-offertehulp-secret` tegen `N8N_HEADER_SECRET` en gebruikt `CALVORA_USER_ID`, of de bestaande optionele header `x-offertehulp-user-id`.

De API geeft `visitsOnly: true`, `visitedAt` en `planningEntryId` terug. De Code-node weigert de oude API zonder bezoekcontrole, zodat een onvolledige backendupdate niet ineens alle conceptoffertes meldt. De Telegram-node schakelt attributie uit en ontsnapt HTML-tekens in klantvelden. De HTTP-node probeert tijdelijke fouten maximaal drie keer; Telegram wordt niet automatisch opnieuw verzonden na een onduidelijke verzendfout.

Gerichte tests:

```bash
node --test scripts/quote-visit-reminder-route.test.cjs scripts/quote-visit-reminder-workflow.test.cjs
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register --test src/lib/quote-visit-reminder.test.ts
```

Het bestaande, ongepubliceerde [Calvora Offerte Reminder-concept](https://n8n.srv1553475.hstgr.cloud/workflow/nATFqqOnMCJdjbgJ) bevat ook de oudere materiaalherinneringen om 06:30 en materiaalcallbacks. De nieuwe offerteworkflow staat daar los van. Activeer niet ook de oude offerteketen als je dubbele herinneringen wilt voorkomen.
