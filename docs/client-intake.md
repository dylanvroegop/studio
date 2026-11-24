# Aanvragen in de app

De pagina **Aanvragen** vervangt de invoer via Telegram voor `auto making client`.
De pagina heeft twee tabs, zonder een overzicht met oude aanvragen:

- **Nieuwe klant**: voeg screenshots of tekst toe en klik **Gegevens uitlezen**.
  Uitlezen, klantopslag, offerteaanmaak en agendareservering volgen automatisch.
  Daarna opent een in-app dialoog met het gereserveerde moment en het klantbericht.
- **Afspraak verwerken**: voeg de vervolgscreenshot toe. De app herkent de
  bestaande aanvraag op contactgegevens of naam en plaats. Bij meerdere passende
  aanvragen moet de gebruiker de juiste aanvraag kiezen; deze route maakt geen
  nieuwe klantaanvraag aan. Expliciete klantbevestiging bevestigt dezelfde afspraak.

Het berichtvenster bevat een kopieerknop en vooraf ingevulde datum/tijd. Een ander
moment wordt eerst gecontroleerd en opgeslagen; pas daarna kan het bijgewerkte
bericht worden gekopieerd. Een aangepaste bevestigde afspraak wordt weer een
voorstel. Handmatige invoer en foutcorrectie staan in het uitklapbare gegevensvak.

Een voorstel is nog niet bevestigd door de klant. De agendareservering moet
opgeslagen zijn voordat de voorsteltekst kan worden gebruikt. De tekst kan
worden gekopieerd; deze verwerking verstuurt geen bericht naar de klant.
De app bewaart fouten en gegevens zodat dezelfde aanvraag opnieuw kan worden
verwerkt. Dezelfde sessie voorkomt extra offertes en afspraken na een retry.

## Herinneringen zonder n8n

Een succesvol verwerkt, onbevestigd voorstel krijgt een `reminderDueAt`
na twee dagen. Die datum staat duurzaam in Firestore bij
`client_intake_sessions`. De worker controleert zowel de huidige sessie als
de gekoppelde planning en het echte Google-event. Bevestigde, afgeronde en
verwijderde afspraken geven geen herinnering. Een onbereikbare agenda wordt
later opnieuw gecontroleerd; er wordt dan geen onbevestigde melding verstuurd.

De worker gebruikt een claim van vijf minuten en controleert de sessieversie
opnieuw na het lezen van de agenda. Elke herinnering heeft een vaste event-ID
per sessie en geplande herinneringsdatum. Een crash of gedeeltelijke
pushaflevering kan veilig worden herhaald. Een geslaagde melding staat in
**Meldingen**; zonder pushabonnement is opslag in die inbox voldoende.
Met actieve apparaten wordt ook op voltooide provideraflevering gecontroleerd.
Acceptatie door de provider bewijst niet dat een telefoon de melding heeft getoond.

De productieplanning draait iedere minuut via Supabase Cron:
`calvora-client-intake-reminder`. Zij roept rechtstreeks de app-route aan;
er is geen n8n-workflow, lokale computer of apart draaiend Node-proces nodig.
De inrichting staat in `supabase/migrations/20261124124221_client_intake_reminder_schedule.sql`.

De scheduler bewaart zijn sleutel in Vault en ondertekent iedere oproep met een
HMAC-token dat alleen voor deze route en maximaal drie minuutvensters geldig is.
Alleen de serverrol kan de controlefunctie aanroepen. De app verwerkt uitsluitend
de ingestelde `CALVORA_USER_ID`. De privéschema-log bewaart zeven dagen lang alleen
request-ID's en tijdstippen, zodat een geplande oproep met zijn HTTP-uitkomst kan
worden gecontroleerd. Er staan geen tokens of klantgegevens in die log.

`client_intake_worker/status` krijgt pas na een afgeronde ronde een
`lastCompletedAt`. De melding in Aanvragen verdwijnt alleen als een ronde recent
succesvol is afgerond; alleen een start-heartbeat telt niet als werkende service.
Bij uitval wordt de waarschuwing na maximaal drie minuten weer zichtbaar bij
het vernieuwen van de pagina. Individuele mislukte herinneringen behouden hun
retrytijd en vaste bericht-ID.

Bij een nieuwe installatie: pas de migratie toe, pauzeer de nieuwe cronjob tijdens
de app-deployment, verifieer de route en activeer de job daarna. Bestaande
installaties behouden hun Vault-sleutel bij opnieuw toepassen van de migratie.

Voor lokale ontwikkeling blijft `npm run intake:worker` beschikbaar;
`npm run intake:worker -- --once` verwerkt één ronde. Als alternatieve scheduler
kan een beveiligde GET met `CRON_SECRET` worden gebruikt. Een POST met een Firebase
ID-token controleert alleen de eigen aanvragen en telt niet als scheduler-heartbeat.

## Overgang van Telegram

De bronexport is privé: `auto making client (26).json` bevat bestaande secrets
en hoort niet in Git. Bestaande klant-, offerte- en agenda-ID's blijven
leidend. Gebruik voor meegenomen legacy-sessies hun bestaande
`telegram_session_<id>`-sleutel; maak geen nieuwe kopie voor dezelfde aanvraag.

Deze code schakelt de bestaande n8n-workflow niet uit en zet oude wachtende
n8n-uitvoeringen niet automatisch over. Controleer de app-invoer,
vervolgcorrectie, agendareservering/bevestiging en worker eerst in de bedoelde
omgeving. Schakel daarna de oude Telegram-trigger uit en handel bestaande
wachtende uitvoeringen expliciet af, zodat geen dubbele herinneringen ontstaan.
Een lokale test bewijst geen deployment, actief workerproces of telefoonpush.

## Gerichte controle

```sh
node --test scripts/client-intake.test.cjs scripts/client-intake-import.test.cjs scripts/client-intake-reminders.test.cjs
npm run typecheck
```

De tests gebruiken alleen synthetische Firestore-, Google- en pushgegevens.
Ze versturen geen echte meldingen en maken geen afspraken aan.

## Lokale verificatie 24 november 2026

De nieuwe pagina en API compileren; de productiebuild, typecontrole en gerichte
lintcontrole slagen. De gecombineerde native- en bestaande importregressies
slagen voor 138 tests. De lokale pagina geeft HTTP 200; anonieme API-toegang
geeft HTTP 401. De browsertool gaf geen leesbare ingelogde pagina terug.
De read-only controle van bestaande gegevens liep vast bij het vernieuwen van
lokale Firebase Application Default Credentials. Er zijn geen echte aanvragen,
agenda-afspraken of meldingen aangemaakt tijdens deze controle. Productiedeployment,
workeractivatie, visuele telefooncontrole en uitschakelen van de oude workflow
zijn hiermee niet aangetoond.

De nieuwe sessies worden uitsluitend server-side via Firebase Admin benaderd;
de bestaande Firestore-regels weigeren rechtstreekse clienttoegang. De nieuwe serverplanning gebruikt alleen een privé-logtabel in Supabase en geen n8n-webhook. Reeds geïmporteerde oude aanvragen
worden vanuit hun bestaande import- en offerterecords in het overzicht getoond;
nog niet geïmporteerde Supabase-sessies en wachtende n8n-uitvoeringen zijn niet
automatisch overgezet.
