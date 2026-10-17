# Klusrapport na eindfactuur

[Workflow in n8n](https://n8n.srv1553475.hstgr.cloud/workflow/MLdDRXMdyEFCPMQ2).

Status: opgeslagen concept, niet gepubliceerd. Nieuwe Telegram-bot en chat-ID worden later ingevuld. De appcode is lokaal getest, nog niet gedeployed; Vercel CLI vraagt opnieuw om inloggen. Er is geen Telegrambericht verzonden.

## Moment en inhoud

Iedere ochtend om **08:00 Europe/Amsterdam** worden eindfacturen geselecteerd die op de vorige Nederlandse kalenderdag daadwerkelijk als verzonden zijn gemarkeerd (`sentAt`). Zomer-/wintertijd volgt Amsterdam. Een concept, voorschot, geannuleerde factuur, wijzigingsdatum of aanmaakdatum sluit de klus niet af. Een meerwerkbonfactuur sluit de onderliggende klus ook niet automatisch af.

Per eindfactuur verschijnt één klusrapport, zo nodig verdeeld over meerdere Telegramberichten zonder aankoopregels weg te laten:

- Werkperiode: eerste t/m laatste geregistreerde werkdag vóór of op de verzenddag; gewerkte uren en unieke werkdatums. Twee registraties op één datum zijn één werkdag. Geen dagen op basis van `uren / 8`.
- Totale facturatie inclusief voorschotten en resterende eindfactuur; ontvangen bedrag uit de factuur-betaalsamenvattingen en restant staan apart. Er vindt geen bankmatch of financiële mutatie plaats.
- Aankopen met iedere productregel, leverancier, datum en de kostengroep uit Kosten. Materiaal en andere gekoppelde kluskosten gaan van de omzet af.
- **Gereedschap wordt nooit van de winst afgetrokken**, ook niet als het rechtstreeks aan de klus gekoppeld is. Alle gereedschapsaankopen tussen de eerste en laatste werkdag staan apart met datum en bedrag. Overlappende klussen mogen hetzelfde gereedschap als informatie tonen. Klusgekoppeld gereedschap buiten deze periode staat apart.
- Voorlopige kluswinst totaal, per geregistreerd uur en per unieke werkdag, exclusief btw. Eigen loon, algemene overhead, afschrijving en inkomstenbelasting zijn niet verwerkt. Dit is de gewenste praktische projectmaatstaf, geen fiscale winst.

Gecombineerde eindfacturen krijgen één gezamenlijk rapport. Facturen die gedeeltelijk buiten die groep vallen of meerdere reguliere eindfacturen veroorzaken `n.b.` voor omzet/ontvangst/winst; er wordt niets willekeurig verdeeld. Gearchiveerde financiële gegevens blijven meetellen.

## Onvolledige gegevens

Ontbrekende of niet aansluitende exclusief-btw-/btw-bedragen in factuursnapshots leveren `n.b.` op. De huidige factuuraanmaak bewaart vaak alleen het inclusief-btw-bedrag. Het rapport gaat daarom niet zomaar uit van 21% en wijzigt geen bestaande facturen. Ontvangen minus kluskosten vóór btw-correctie staat apart als er voldoende bronbedragen zijn.

De rapportage gebruikt bronbonnen/-facturen, inclusief nog niet op de bank afgeschreven aankopen. Dezelfde matching en categorie-overrides als Kosten worden gebruikt waar de bankcontrole beschikbaar is. Ongekoppelde gereedschapsafschrijvingen tonen expliciet de bankdatum en onbekende product-/btw-gegevens. Een bankfout levert een waarschuwing en broncategorieën op, geen verzonnen bankvolledigheid. Een mislukte bronquery stopt het gehele rapport. Onbevestigde of niet aansluitende kostenregels worden niet als betrouwbaar nulbedrag behandeld.

## Activeren

1. Deploy de appcode met `/api/finance/job-report`; de server heeft `N8N_HEADER_SECRET` en `CALVORA_USER_ID` nodig. De bestaande beveiligde Calvora-header staat al in de drie HTTP-nodes.
2. Kies in **Stuur klusrapport** de nieuwe Telegramcredential en vul het persoonlijke chat-ID in. Start de nieuwe bot eenmaal vanuit Telegram.
3. Controleer een rapport met `GET /api/finance/job-report` en dezelfde beveiligde header. GET is alleen een voorbeeld en reserveert niets.
4. Test de keten met een echte eindfactuur die de vorige kalenderdag is verstuurd, controleer ontvangst, en publiceer daarna de workflow. Zonder passende eindfacturen wordt niets gestuurd.

Niet vóór de nieuwe bot/deployment uitvoeren: POST `prepare` maakt blijvende rapportmomentopnamen, `claim` reserveert het deel vóór Telegram. Een proefuitvoering tot aan claim zonder daadwerkelijke verzending laat dus een onzekere reservering achter.

## Dubbele verzending voorkomen

Rapporten worden één keer per eindfactuur bewaard onder `users/{uid}/jobFinanceReports/{invoiceId}`. De API gebruikt altijd de vaste server-eigenaar, nooit een uid uit de aanvraag. De subcollectie is alleen via Firebase Admin toegankelijk. Er worden geen bronfacturen, kosten of uren gewijzigd.

Ieder berichtdeel wordt transactioneel gereserveerd. Na een Telegramantwoord met `message_id` wordt het als verzonden vastgelegd. Herhaling en gelijktijdige uitvoeringen mogen hetzelfde deel niet nogmaals versturen. Deel voor deel verwerken voorkomt dat alle delen vooraf gereserveerd raken. HTTP prepare/bevestiging mogen opnieuw worden geprobeerd; reserveren en Telegram zelf niet na een onduidelijke fout.

Als een verzending na reserveren mislukt of de bevestiging ontbreekt, blijft de status `sending`. Een volgende uitvoering stopt met een controlebericht in n8n. Controleer eerst Telegram; bevestig daarna het bestaande bericht met dezelfde reservering, of verwijder uitsluitend de onzekere reservering als vaststaat dat niets is verzonden. Nooit blind vrijgeven.

Ongereserveerde delen van eerder voorbereide rapporten worden later hervat. Als de workflow een volledige ochtend niet draait vóórdat `prepare` een momentopname heeft gemaakt, wordt die verzenddag niet automatisch ingehaald. Controleer n8n-fouten en gemiste uitvoeringen. Historische facturen worden bij activering niet massaal gerapporteerd.

## Tests

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register --test src/lib/job-finance-report.test.ts
node --test scripts/job-finance-delivery.test.cjs
npm run typecheck
git diff --check
```

`scripts/job-finance-workflow.cjs` bouwt de workflow uit een bestaande beveiligde Calvora-HTTP-node. Houd exports met ingevulde headers buiten Git. Telegramcredential en chat-ID ontbreken bewust in het concept.
