# Aanvragen in de app

De pagina **Aanvragen** vervangt de invoer via Telegram voor `auto making client`.
Een screenshot of tekst wordt in de app uitgelezen. Controleer klantgegevens,
klus en afspraak en verwerk de aanvraag. Vervolgberichten en correcties horen
bij dezelfde opgeslagen aanvraag. Klant, offerte, planning en Google Agenda
worden via de bestaande importlogica aangemaakt of bijgewerkt.

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

Start naast de webapp een blijvende Node-processervice:

```sh
npm run intake:worker
```

Eén controle uitvoeren:

```sh
npm run intake:worker -- --once
```

De worker leest `.env.local` en gebruikt dezelfde Firebase Admin- en Google
Calendar-configuratie als de webapp. Hij controleert elke minuut en schrijft
zijn heartbeat naar `client_intake_worker/status`. Gebruik op de server een
processmanager die de worker herstart. Alleen de Next.js-webserver starten
start deze achtergrondservice niet.

Als alternatief kan een externe scheduler elke minuut
`GET /api/client-intake/reminders` aanroepen met
`Authorization: Bearer <CRON_SECRET>`. Configureer `CRON_SECRET` uitsluitend
op de server en in die scheduler. Deze route gebruikt geen n8n-secret.
`POST` met een Firebase ID-token controleert uitsluitend de aanvragen van de
ingelogde gebruiker. Gebruik de worker of scheduler voor meldingen terwijl de
app gesloten is. De route alleen beschikbaar maken activeert geen planning.

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
de bestaande Firestore-regels weigeren rechtstreekse clienttoegang. Er is geen
nieuwe Supabase-tabel of n8n-webhook nodig. Reeds geïmporteerde oude aanvragen
worden vanuit hun bestaande import- en offerterecords in het overzicht getoond;
nog niet geïmporteerde Supabase-sessies en wachtende n8n-uitvoeringen zijn niet
automatisch overgezet.
