# Telegram-fouten en correcties

De bot toont bij een fout de mislukte stap, reden, foutcode, gebruikte gegevens, opslagstatus en een link naar de n8n-uitvoering. Headers, stacks en credentials worden niet overgenomen. Ook dubbel gecodeerde JSON-foutantwoorden worden gelezen.

## Aanpassen via Telegram

Gebruik **Beantwoorden** op de nieuwe foutmelding en zet één veld per regel:

```text
Woonplaats: Almere
```

Ondersteunde velden: Klantnaam, Telefoon, E-mail, Adres, Woonplaats, Klus, Datum, Tijd en Status. Datum accepteert `jjjj-mm-dd` of `dd-mm-jjjj`; tijd is `uu:mm`. Status is `voorstel` of `bevestigd`. Alleen genoemde velden veranderen. Een `-` maakt een veld leeg. Vrije tekst wordt niet door AI geïnterpreteerd als correctie.

Een oude algemene foutmelding heeft geen sessieverwijzing. Stuur daarvoor de screenshot opnieuw, eventueel met gelabelde correcties als bijschrift. Nieuwe meldingen en succesvolle correcties bevatten een sessie en versie waarop kan worden geantwoord.

## Beveiliging en opslag

- Alleen de bestaande eigenaar in de privéchat en replies op deze bot worden verwerkt. Doorgestuurde berichten worden geweigerd.
- De reply verwijst naar één sessie. Versiecontrole voorkomt dat een oude melding een nieuwere sessie overschrijft.
- De gecorrigeerde sessie wordt bewaard, waarna dezelfde `telegram_session_<uuid>` opnieuw wordt geïmporteerd. Een importfout laat de correctie beschikbaar.
- De bestaande import bewaakt klantidentiteit, dubbele afspraken en Google Agenda. Een correctie omzeilt deze controles niet.
- Het verplaatsen van een bevestigde afspraak vereist een expliciete status. Een voorstel is geen klantbevestiging.
- Alleen een bevestigd API-resultaat met klant-, offerte- en agendagegevens geeft succes. De sessiestatus wordt daarna bijgewerkt, opnieuw met versiecontrole.
- Er wordt geen bericht naar de klant gestuurd. Eventuele voorsteltekst is bedoeld om zelf te versturen.

## Onderhoud en tests

`scripts/telegram-corrections.cjs` voegt de correctieroute toe aan een gecontroleerde workflowexport. `scripts/telegram-failure-details.cjs` maakt het foutbericht. De oorspronkelijke workflow en een Telegram-referentie zijn nodig om bestaande koppelingen en ontvanger te behouden.

```sh
node scripts/telegram-corrections.cjs /privé/bron.json /privé/telegram-referentie.json /privé/uitvoer.json EIGENAAR_CHAT_ID BOT_ID
node --test scripts/telegram-corrections.test.cjs scripts/telegram-failure-details.test.cjs scripts/telegram-client-identity.test.cjs scripts/telegram-appointment-calendar.test.cjs
```

Voor de extra workflow-integratietest: stel `TELEGRAM_CORRECTION_SOURCE` en `TELEGRAM_CORRECTION_REFERENCE` in op de privéexports. Volledige exports bevatten authenticatiegegevens: nooit committen.

## Verificatie op 3 november 2026

- Uitvoering 2143 stopte met HTTP 400 doordat telefoon, e-mail en woonplaats ontbraken. Naam en straatadres alleen waren onvoldoende.
- **Foutdetails en correcties via Telegram-reply** is gepubliceerd in workflow `Xal6adg1neOkMczi` (14:33:43 volgens n8n).
- De 34 geïmporteerde nodes en hun verbindingen zijn via een nieuwe export gecontroleerd. Er is geen vastgezette testinvoer.
- Het bestaande concept voor appmeldingen is met de correctieroute teruggezet en blijft ongepubliceerd. De actieve versie behoudt Telegram.
- Alle 82 gerichte tests slagen, inclusief het uitvoeren van de ingebedde n8n-correctiecode met synthetische invoer.
- Er zijn geen echte import-, klant- of agendaschrijfacties gestart tijdens de tests. Ontvangst en volledige verwerking van een nieuw Telegram-bericht zijn nog niet end-to-end bevestigd.
- Aanvullende Nederlandse API-validatie en specifiekere klantconflictdetails staan lokaal in de appcode; deze appwijzigingen zijn niet gedeployed. De gepubliceerde n8n-foutformatter verwerkt ook de huidige API-antwoorden.
