# Pushmeldingen op iPhone en andere apparaten

Open Calvora vanaf het beginscherm. Ga naar **Instellingen → Meldingen → Meldingen inschakelen** en geef toestemming. Gebruik daarna **Testmelding sturen**. iPhone vereist iOS 16.4 of nieuwer. De permissievraag is een verplichte iOS-systeemdialoog die alleen na een bewuste tik verschijnt. Foutmeldingen en overige bediening staan in de app.

Push gebruikt een service worker zonder offlinecache. Ook de bestaande snelkoppeling voor Factureren blijft bruikbaar. Een melding opent uitsluitend een pagina op dezelfde oorsprong. Meldingen staan per apparaat aan; uitloggen schrijft het apparaat uit. Focus/energiebesparing/netwerk kunnen ontvangst uitstellen: een succesvolle API-respons bewijst alleen acceptatie door de pushprovider.

## Serverconfiguratie

De bestaande Firebase Admin-configuratie volstaat. De eerste geauthenticeerde configuratieaanvraag maakt in een Firestore-transactie één blijvend VAPID-sleutelpaar in `push_private/vapid`. Alle serverinstanties gebruiken dezelfde sleutel. Deze collectie, `push_subscriptions` en `push_deliveries` zijn uitsluitend toegankelijk via de Admin SDK; de browser krijgt alleen de publieke sleutel. Verwijder of roteer het sleutelpaar niet zonder apparaten opnieuw te registreren. Neem deze servergegevens op in het bestaande back-upbeleid.

De automatiseringsroute gebruikt de bestaande `N8N_HEADER_SECRET` en **uitsluitend** `CALVORA_USER_ID` als ontvanger. Een body/header kan geen andere gebruiker kiezen.

## n8n aansluiten

Vervang de verzendstap van een melding door een **HTTP Request**-node:

- Method: `POST`
- URL: `https://app.calvora.nl/api/push/send`
- Authentication: bestaande Header Auth-credential met `x-offertehulp-secret`
- Body Content Type: JSON
- Timeout: 60000 ms

Voorbeeldbody:

```json
{
  "title": "Offerte maken",
  "body": "De werkbespreking is afgerond. Je kunt de offerte uitwerken.",
  "url": "/offertes/DE_OFFERTE_ID",
  "eventId": "offerte-herinnering:DE_OFFERTE_ID:2026-10-11"
}
```

`eventId` is een stabiele sleutel voor één melding. Gebruik bij herhaalde dagelijkse herinneringen de datum in Europe/Amsterdam. Hergebruik bij een retry precies dezelfde eventId. Limieten: titel 100, tekst 800, interne URL 1000 en eventId 200 tekens. Splits langere rapporten in afzonderlijke berichten met een volgnummer in eventId of link naar het rapport in Calvora. HTML-opmaak van Telegram hoort niet in deze platte tekst.

Respons: `accepted` is aangenomen door de provider, `skipped` was eerder aangenomen, `expired` is verwijderd (404/410), `failed` is tijdelijk mislukt of nog onderweg en `devices` is het aantal geselecteerde apparaten. HTTP 409 betekent geen bruikbare ontvanger; 503 betekent een fout. Markeer de workflowmelding pas als verstuurd na HTTP 200 / `ok: true`. Een provider-timeout blijft onzeker; een retry heeft dezelfde notification-tag zodat de telefoon de melding kan vervangen. Dit is geen garantie op exact-eenmaal aflevering.

`docs/n8n-push-node.json` bevat een importeerbare verzendnode. Kies na import de bestaande beveiligde Header Auth-credential. De input moet title/body/url/eventId bevatten.

Google Calendar-synchronisatiefouten gebruiken push automatisch zodra een apparaat beschikbaar is, met de bestaande n8n-webhook als terugval. Overige n8n-workflows moeten hun verzendnode expliciet omzetten. Telegram-invoer, foto's, knoppen en callbackacties zijn geen pushmeldingen en blijven een aparte integratie.

## Verificatie en uitrol

```sh
node --test scripts/push-notifications.test.cjs
npm run typecheck
npm run build
```

Publiceer de code op hetzelfde HTTPS-domein als de beginscherm-app. De nieuwe collecties vallen ook onder de bestaande default-deny-regels; de expliciete deny-regels documenteren deze grens. Er zijn geen publieke Firestore-rechten of extra omgevingsvariabelen nodig. Controleer op een echte iPhone: inschakelen, gesloten app, vergrendelscherm, tik naar offerte, uitloggen en daarna geen ontvangst. Schakel bestaande Telegram-verzending pas om nadat de testmelding op het bedoelde toestel is ontvangen.
