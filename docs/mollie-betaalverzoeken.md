# Mollie-betaalverzoeken

Op de offertepagina staat naast **Maak factuur** de knop **Betaalverzoek** (ook op mobiel).
Het venster toont standaard **50% vooraf** en **50% achteraf**, met automatisch berekende bedragen
inclusief btw en omschrijvingen. Alleen **Ander bedrag** toont de handmatige invoervelden.
Een betaalverzoek maakt een eenmalige iDEAL-link en bewaart deze in `quotes/{quoteId}/payment_requests`.
De link kan worden gekopieerd of geopend. **Status** haalt de actuele betaalstatus bij Mollie op.
Dit maakt geen factuur en boekt geen omzet of banktransactie.

## Serverinstellingen

- `MOLLIE_API_KEY`: standaard profielgebonden sleutel, uitsluitend server-side.
- `MOLLIE_OWNER_UID`: Firebase-gebruikers-id van de eigenaar van dit Mollie-account.

De sleutel bepaalt test/live-modus. De UI toont testmodus expliciet en toont alleen verzoeken uit
de huidige modus. API-routes controleren zowel de Mollie-eigenaar als de offerte-eigenaar.
Firebase Admin schrijft de subcollectie; clienttoegang is niet nodig.

Lokaal staan de instellingen in de door Git genegeerde `.env.local`. Voor productie moeten ze
apart in de hostingomgeving worden ingesteld. `.env.local` wordt niet automatisch gedeployed.
De huidige lokale instelling gebruikt de livesleutel. De agent voert zelf geen betalingen uit.

## Status en opnieuw proberen

Bij openen worden de betaalstatussen van de twee termijnen automatisch opgehaald. Als vooraf betaald
is, staat achteraf geselecteerd. De knop **Status** blijft beschikbaar. Er is nog geen publieke webhook geconfigureerd.
Voor een webhook is een bereikbare HTTPS-route nodig; localhost werkt daarvoor niet.
Betalingen veranderen de offerte- of factuurstatus niet automatisch.

Elke aanmaakpoging reserveert een document met een unieke request-id en vaste bedrag/omschrijving.
Retries gebruiken dezelfde Mollie-idempotency key; een herhaling na geslaagde opslag geeft de bestaande link terug.
Voor vaste termijnen zijn de document-id's `test_upfront`, `test_final`, `live_upfront` en `live_final`.
Een transactie-lock per offerte/modus voorkomt gelijktijdige wijzigingen vanuit meerdere tabs.
Bij openen en bij een gewijzigd eindbedrag synchroniseert het venster de bestaande termijnen.
De server berekent het actuele eindtotaal opnieuw uit de laatste opgeslagen calculatie, met dezelfde
instellingen en werkdaglengte als het offerteoverzicht. Een historische prijsafspraak of oud
termijntotaal overschrijft dit niet. Bij nog niet opgeslagen wijzigingen wordt eerst opnieuw geprobeerd.

Onbetaalde termijnen volgen de nieuwe eindprijs. Mollie ondersteunt geen wijziging van het vaste
linkbedrag: daarom archiveert Calvora de oude link en maakt een nieuwe link met het juiste bedrag.
Kopieer na een wijziging de nieuwe link. Oude linkgegevens blijven in de revisiehistorie bewaard.
Een reeds gestarte betaling (`open`, `pending`, `authorized`) blokkeert vervanging totdat deze definitief
is; de oude link blijft tijdens die controle gesloten. Bij een fout wordt geen verouderde link gedeeld.
Elke revisie wordt vooraf opgeslagen en heeft een eigen idempotency key. Na een netwerk- of opslagfout
wordt eerst die revisie afgerond, zodat er geen dubbele of vergeten links ontstaan.

Betaalde termijnen blijven behouden: achteraf wordt het actuele totaal min de betaalde aanbetaling.
Bij € 1,10 -> € 1,23 wordt onbetaald € 0,62 + € 0,61; als € 0,55 al betaald is, wordt het restant € 0,68.
Wanneer het totaal lager is dan reeds betaald, wordt een open restantlink gesloten; dit maakt geen
negatieve betaling en voert geen automatische terugbetaling uit.
Vooraf wordt op hele centen afgerond en achteraf krijgt het restant, zodat beide termijnen exact optellen.
Een nulbedrag kan geen vaste termijn opleveren. Een afwijkend bedrag kan via **Ander bedrag**.
Alleen bij handmatige verzoeken kan expliciet **Nieuw betaalverzoek** worden gekozen.

Controle: `node --test scripts/payment-requests.test.cjs`.

Mollie-referentie: https://docs.mollie.com/reference/update-payment-link (archiveren; geen vast bedrag aanpassen).
