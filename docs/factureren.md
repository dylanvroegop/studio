# Factureren

De directe ingang is `/facturen/start` (navigatie: **Factureren**). Op iPhone kan deze pagina via Safari aan het beginscherm worden toegevoegd; `factureren.webmanifest` opent rechtstreeks deze route. Inloggen behoudt de bestemming.

## Route

1. Zoek de klant/klus of kies een recente klus bij **Te factureren**.
2. Controleer type, offertebedrag, werkelijk gefactureerd voorschot, ontvangen voorschot en het nieuwe factuurbedrag.
3. **Maak en deel** reserveert het nummer en maakt één concept. Bestaande concepten worden hervat. Bedragen aanpassen staat apart onder **Aanpassen**.
4. Het deelvenster bereidt een benoemd PDF-bestand en bericht voor. Delen start rechtstreeks vanuit de tik, zodat iPhone-gebruikersactivatie behouden blijft. WhatsApp en ontvanger worden gekozen in de deelfunctie. **Kopiëren** en downloaden/openen van WhatsApp zijn terugvalopties.
5. Delen/openen bewijst geen verzending: de factuur wordt pas op **Verzonden** gezet via **Ik heb de factuur verstuurd**. Annuleren verandert de status niet.

De standaardberichttekst kan bij het account worden opgeslagen. Bestaande niet-lege browsertekst wordt aangeboden bij ontbreken van een accounttekst; oude automatisch lege browserinstellingen krijgen een standaardbericht. Een bewust leeg opgeslagen accountbericht blijft leeg.

## Bedragen en gelijktijdige acties

- Concepten tellen niet als gefactureerd voorschot. Werkelijk uitgebrachte voorschotten worden opgeteld, ongeacht de betaalstatus. De eindfactuur gebruikt geen nieuw berekende 50% van een gewijzigde offerte.
- Meerdere conflicterende concepten/eindfacturen vragen controle. Vanuit de melding toont `/facturen?quoteId=...` ook gearchiveerde facturen bij deze klus.
- Aanmaken controleert eigenaar, actuele offerte/calculatie en bestaande facturen server-side. Nummerreservering en aanmaken gebeuren in dezelfde Firestore-transactie. Dezelfde termijn kan bij herhalen of gelijktijdige verzoeken niet nogmaals worden aangemaakt. Geannuleerde termijnen kunnen worden vervangen.
- Een aparte meerwerkbonfactuur heeft een eigen termijn en bedrag; deze sluit de oorspronkelijke offertefacturatie niet af.
- Nieuwe facturen bewaren een versie-gemarkeerde volledige calculatiesnapshot. Oude facturen behouden de nodige bronverrijking. Dezelfde PDF wordt voor preview, download en delen hergebruikt zolang de gegevens gelijk zijn.
- Bedragwijzigingen lezen de actuele betaalstatus in een transactie; een ondertussen gekoppelde bankbetaling wordt niet overschreven.

## Knab

Factuurbezoek leest opgeslagen bankgegevens zonder betalingen te boeken. **Controleer betalingen** synchroniseert Knab en controleert betalingen. Ook de bestaande succesvolle Knab-synchronisatie koppelt eenduidige ontvangen betalingen aan uitgebrachte facturen, maximaal 25 per synchronisatie. Overige matches en conflicten worden in het resultaat gemeld. Er is geen nieuw schema of scheduler toegevoegd.

Automatisch koppelen vereist één volledig factuurnummer, precies het openstaande EUR-bedrag en geen conflicterende match of al handmatig geboekte betaling. Naam/bedrag, deelbetalingen en gecombineerde betalingen blijven voorstellen. Een reeds handmatig ontvangen bedrag kan aan bankbewijs worden gekoppeld zonder het opnieuw op te tellen. Toewijzingen houden het transactiebedrag en factuurrestant bij en zijn herhaalbaar zonder dubbeltelling.

De banktoewijzingen staan onder `users/{uid}/invoiceBankAllocations`; bankbetaalregels hebben een `bank_`-id en worden uitsluitend server-side beheerd. Publiceer de gewijzigde `firestore.rules` samen met de app. Geen nieuwe SQL-migratie nodig.

## Controle

```sh
node --test scripts/invoice-start.test.cjs scripts/invoice-sharing.test.cjs scripts/invoice-bank-payments.test.cjs scripts/invoice-bank-ui.test.cjs scripts/invoice-detail-reliability.test.cjs scripts/invoice-creation.test.cjs scripts/invoice-performance.test.cjs
npm run test:invoice-pdf
npm run typecheck
npm run build
git diff --check
```

De lokale browsercontrole gebruikt een viewport van 390 × 844. Deze bewijst de mobiele layout en ingevulde gegevens, niet de overdracht naar WhatsApp op een echte iPhone. Controleer na publicatie op de iPhone: ontvanger, PDF-naam, overname van berichttekst, annuleren en bevestigen van verzending. Meet daar koude start en tijd tot bruikbare controlekaart; er is nog geen productiesnelheid beloofd. De lijst registreert lokaal de performance-meting `factureren-lijst-laden`.
