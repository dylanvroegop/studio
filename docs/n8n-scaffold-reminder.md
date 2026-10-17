# Steiger reserveren

De workflow **Steiger reserveren - 14 dagen voor start** controleert dagelijks om 08:00 (Europe/Amsterdam) de opgeslagen optie **Steiger** in Werk & Levering.

- Eerste bevestigde werkdag van de offerte; werkbesprekingen, pending en geannuleerde planning tellen niet mee.
- Vanaf 14 kalenderdagen vóór start, tot de dag vóór start. Ook later aanvinken of later inplannen wordt zo meegenomen.
- Eén melding per offerte en startdatum; een nieuwe startdatum krijgt een nieuwe beoordeling.
- Uitgeschakelde steiger, gearchiveerde/afgewezen/verlopen offerte of reeds begonnen klus geeft geen melding.
- De optie wordt uit dezelfde Supabase-calculatie gelezen als in de offerte-editor, inclusief completed-fallback. Expliciet uitgeschakeld overschrijft oude kluswaarden.
- Telegram bevat klant, offertenummer, klus, startdatum en offertelink.

## Installatie

Workflow: https://n8n.srv1553475.hstgr.cloud/workflow/OPnWHfQtao66NLC4

Importbestand: `docs/n8n-scaffold-reminder.json`. Generator: `node scripts/scaffold-reminder-workflow.cjs`.

1. Deploy de bijbehorende Calvora-route `/api/offertes/scaffold-reminder`.
2. De opgeslagen workflow heeft de drie HTTP-nodes al gekoppeld aan de bestaande Calvora-header-authenticatie (`x-offertehulp-secret`, serverwaarde `N8N_HEADER_SECRET`). De route gebruikt uitsluitend de serverinstelling `CALVORA_USER_ID`.
3. De opgeslagen workflow gebruikt **Telegram account 2**, met dezelfde persoonlijke chat als `auto making client`. Het generieke importbestand bevat geen accountgegevens.
4. Controleer eerst uitsluitend de GET-node. Geen open herinneringen is een geldige lege uitkomst.
5. Publiceer de workflow. Er is geen Telegram Trigger nodig.

## Betrouwbaarheid

GET leest zonder mutaties. POST `claim` herleest planning en schakelaar en reserveert transactioneel in `users/{uid}/scaffoldReminders/{sha256(quoteId,startDay)}`. Telegram krijgt geen automatische retry. Pas een geslaagde Telegram-uitkomst wordt met POST `sent` bevestigd. Overlappende runs kunnen daardoor niet dezelfde herinnering reserveren.

Een onzekere verzending blijft `sending` en blokkeert volgende uitvoeringen met een zichtbare n8n-fout. Controleer de n8n-executie en Telegram voordat deze toestand handmatig wordt hersteld. Nooit blind opnieuw verzenden. Supabase en Firestore delen geen transactie; wijzigen in de korte tijd tussen laatste broncontrole en Telegram-verzending kan nog een melding voor de vorige planning opleveren.

## Verificatie

```sh
node --test scripts/scaffold-reminder-workflow.test.cjs scripts/scaffold-reminder-server.test.cjs
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register --test src/lib/scaffold-reminder.test.ts
npm run typecheck
```

Op 11 oktober 2026: 13 gerichte tests, gerichte lint, typecheck en een geïsoleerde productiebuild (HEAD plus alleen de steigerbronbestanden) geslaagd. Lokale API met bestaande gegevens: onbevoegd 401, bevoegd 200 met nul verschuldigde herinneringen. Dit bewijst geen live Telegram-verzending. Backend nog niet gedeployed; n8n-workflow nog niet gepubliceerd.
